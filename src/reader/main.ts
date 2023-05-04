import { join } from 'path';
import { existsSync, readdirSync, readFileSync } from "fs";
import { ProcessedURL, UrlArgument, PathConverterTypes, TraverseOptions, AppUrlConfigs, ReadOptions } from './main.d';
import { braceReader, Braces } from "./utilities";


export class UtilityClass {

    static cleanTextBeforeProcessing(text: string, allowNewLines = false): string {
        // Remove new lines, and python comments
        const repl = text.replace(
            /""".*?"""/sg, ''
        ).replace(
            /#.*?\n/sg, ''
        );

        return allowNewLines ? repl : repl.replace('\n', ' ');
    }

    static getGroupMatch(matches: RegExpMatchArray | null, groupName: string, fallback = ''): string {
        // Presented with a match, return a string or the default
        if (matches && matches.groups && matches.groups[groupName]) {
            return matches.groups[groupName];
        }
        return fallback;
    }
}


export class ConfigReader {
    /**
     * Read the configurations of a project
     * */
    private patterns = {
        appName: /app_name.*?['"](?<appName>.*?)['"]/,
        reverseName: /\bname=['"](?<name>.*?)['"]/,
        urlArgs: /<.*?>/g,
        adminImport: /^from\sdjango\.contrib.*?(?<imp>admin.*?)$/m
    }
    private pathConverters = new Map<string, PathConverterTypes>([
        [ 'slug', 'slug' ], [ 'int', 'integer' ], [ 'str', 'string' ], [ 'uuid', 'UUID' ], [ 'path', 'path' ]
    ]);

    constructor(private errorCallback?: (message: string) => void) {
    }

    protected typePathConverter(matches: RegExpMatchArray | null): Array<UrlArgument> {
        // get an array of arg matched, convert it to correct format
        // ['<str:action>',] => [ { name: 'action', type: 'string' } ]
        if (matches) {
            const args: Array<UrlArgument> = [];

            matches.forEach((match) => {
                const cleanedMatch = match.replace(
                    '<', ''
                ).replace('>', '')
                const splitItems = cleanedMatch.split(':');

                if (splitItems.length === 2) {
                    const updArgType = this.pathConverters.get(splitItems[0]);
                    args.push({ name: splitItems[1], type: updArgType ? updArgType : null });
                } else if (splitItems.length === 1) {
                    args.push({ name: cleanedMatch, type: null })
                }
            });

            return args;
        }
        return [];
    }

    /**
     * Gets text from a 'urls.py' file finds the app_name, if any, and the `urlpatterns`
     * */
    configsFinder(text: string, filePath: string): { [appName: string]: Array<string> } {
        const formattedText = UtilityClass.cleanTextBeforeProcessing(text);
        // get appName
        const appName: string = UtilityClass.getGroupMatch(
            formattedText.match(this.patterns.appName),
            'appName',
            `READER_FILE_PATH_${filePath}`
        );

        let urls: string[] = []

        // get URLS from urlpatterns
        try {
            const urlPatterns = braceReader(formattedText, Braces.SQUARE_BRACKET_OPEN);
            urls = urlPatterns.map((pattern) => {
                return braceReader(pattern, Braces.ROUND_BRACKET_OPEN);
            }).flat();
        } catch (error) {
            if (error && error instanceof Error && this.errorCallback) {
                this.errorCallback(`${error.message}\n${filePath}`);
            }
        }

        return { [appName]: urls }
    }

    /**
     * get the urls patterns and process to return URLS
     * */
    urlsProcessor(configs: { [appName: string]: Array<string> }): AppUrlConfigs {
        const processedConfigurations = new Map<string, Array<ProcessedURL>>();

        Object.entries(configs).forEach(([ key, urls ]) => {
            const processedUrls: Array<ProcessedURL> = [];
            const appHasNoAppName = key.includes('READER_FILE_PATH_');

            urls.forEach((urlText) => {
                const matchedName = UtilityClass.getGroupMatch(
                    urlText.match(this.patterns.reverseName),
                    'name'
                );
                const matchedArgs = urlText.match(this.patterns.urlArgs);

                if (matchedName) {
                    processedUrls.push({
                        name: matchedName,
                        args: this.typePathConverter(matchedArgs),
                        hasArgs: !!matchedArgs,
                        viewName: appHasNoAppName ? matchedName : `${key}:${matchedName}`
                    });
                }
            });
            processedConfigurations.set(key, processedUrls);
        });

        return processedConfigurations;
    }

    /*
    * Extract models registered in the admin module
    * */
    modelsFinder(text: string): Array<string> {
        const models: Array<string> = [];
        const cleanText = UtilityClass.cleanTextBeforeProcessing(text, true);

        // get import
        const importMatch = UtilityClass.getGroupMatch(
            cleanText.match(this.patterns.adminImport),
            'imp',
            ''
        );

        if (importMatch) {
            const actualImport = importMatch.replace(/.*?import\s/, '');
            const [ importName, alias ] = actualImport.split(' as ');

            if (importName) {
                const scopeName = alias ? alias : importName;

                // get assignments
                const assignExp = new RegExp(`^(?<var>\\w+)[a-zA-Z\\d\\s]*=\\s*${scopeName}.*?\\w*$`, 'm');
                const assignVar = UtilityClass.getGroupMatch(assignExp.exec(cleanText), 'var');
                const regFunc = assignVar ? assignVar : scopeName;

                const deco = new RegExp(`^@${regFunc}(?:\\.register)*\\((?<models>.*?)(?:, site=.*?)?\\)`, 'mg');
                const meth = new RegExp(`^${regFunc}(?:\\.site)*(?:\\.register)*\\((?<models>\\w+)`, 'mg');

                let decoMatch = deco.exec(cleanText);
                let methMatch = meth.exec(cleanText);

                while (decoMatch !== null || methMatch !== null) {
                    // for @admin.register()
                    if (decoMatch) {
                        const posModels = UtilityClass.getGroupMatch(
                            decoMatch,
                            'models'
                        ).match(/\w+/g);

                        if (posModels) {
                            models.push(...posModels);
                        }
                        decoMatch = deco.exec(cleanText);
                    }

                    // admin.site.register()
                    if (methMatch) {
                        models.push(UtilityClass.getGroupMatch(methMatch, 'models'));
                        methMatch = meth.exec(cleanText);
                    }
                }
            }
        }
        return models;
    }
}


export class FilesFinder {
    /**
     * Find the files where django url configurations are declared
     * */

    private ignoredFolders = [
        '.idea', '.vscode', '.git', '__pycache__', 'templates',
        'tests', 'media', 'static', 'migrations', 'node_modules',
        'templatetags', 'Scripts', 'Lib', 'Include', '.github', '.gitlab'
    ];
    projectPath: string | null = null;

    constructor(private errorCallback?: (message: string) => void) {
    }

    protected traverseDirs(path: string, options: TraverseOptions) {
        let proceed = false;
        const proceedNextFunc = () => proceed = true;

        const wrappedTraversal = (wrappedPath: string, depth: number) => {
            // this is here to ensure that `proceed` is the same across the stack
            proceed = false;
            const dirents = readdirSync(wrappedPath, { withFileTypes: true });
            const directories = [];
            const files = [];

            for (const dirent of dirents) {
                if (dirent.isFile()) {
                    files.push(dirent.name);
                } else if (dirent.isDirectory() && !this.ignoredFolders.includes(dirent.name)) {
                    directories.push(dirent.name);
                }
            }

            options.handleFiles(wrappedPath, files, proceedNextFunc);

            if (depth > 0) {
                for (const directory of directories) {
                    if (proceed) {
                        wrappedTraversal(join(wrappedPath, directory), depth - 1);
                    }
                }
            }
        }

        try {
            wrappedTraversal(path, options.depth);
        } catch (error) {
            if (this.errorCallback) {
                this.errorCallback(path)
            }
        }
    }


    /**
     * From a home directory of django project, find all 'urls.py'
     * */
    urlConfigsFinder(): Array<string> {
        const urlPaths: Array<string> = [];

        if (this.projectPath) {
            this.traverseDirs(this.projectPath, {
                depth: 2,
                handleFiles: (base, fileNames, next) => {
                    if (fileNames.findIndex((fileName) => fileName === 'urls.py') > -1) {
                        urlPaths.push(join(base, 'urls.py'));
                    }
                    next();
                }
            });
        }
        return urlPaths;
    }

    adminModuleFinder(appPaths: { [appName: string]: string }) {
        /*
            Given { 'accounts': 'path/to/app/' }
            Models in django are registered in the admin module
            1. projectRoot/app/admin.py
            2. projectRoot/app/admin/*
        */
        const modules = new Map<string, Array<string>>();

        Object.entries(appPaths).forEach(([appName, appPath]) => {
            const singleAdmin = join(appPath, 'admin.py');
            const modularAdmin = join(appPath, 'admin', '__init__.py');

            try {
                if (existsSync(singleAdmin)) {
                    modules.set(appName, [readFileSync(singleAdmin, { flag: 'r', encoding: 'utf-8' })]);
                } else if (existsSync(modularAdmin)) {
                    const txt = UtilityClass.cleanTextBeforeProcessing(
                        readFileSync(modularAdmin, { flag: 'r', encoding: 'utf-8' }),
                        true
                    );

                    const appHomeDir = UtilityClass.getGroupMatch(
                        appPath.match(/\\(?<homeDir>\w+)$/),
                        'homeDir'
                    );

                    if (txt && appHomeDir) {
                        const impTexts: Array<string> = [];
                        const importExp = new RegExp(
                            `from\\s(?:${appHomeDir}|\\.)*\\.(?:admin)*\\simport\\s(?<imps>.*?)$`,
                            'm'
                        );

                        const adminImports = UtilityClass.getGroupMatch(
                            importExp.exec(txt),
                            'imps'
                        ).split(', ');

                        adminImports.forEach((imp) => {
                            const importPath = join(appPath, 'admin', `${imp}.py`);

                            if (existsSync(importPath)) {
                                impTexts.push(readFileSync(importPath, { flag: 'r', encoding: 'utf-8' }));
                            }
                        });

                        modules.set(appName, impTexts);
                    }
                }
            } catch {
                if (this.errorCallback) {
                    this.errorCallback(`Admin file error in "${appPath}"`);
                }
            }
        });

        return modules;
    }

    /**
     * Find the django project home directory.
     * */
    projectFinder(path: string): string | null {
        this.traverseDirs(path, {
            depth: 5,
            handleFiles: (base, fileNames, next) => {
                if (fileNames.findIndex((fileName) => fileName === 'manage.py') > -1) {
                    this.projectPath = base;
                } else {
                    next();
                }
            }
        });
        return this.projectPath;
    }
}


/**
 * Get a list of paths of suspect django projects and return the processed urls
 * */
export default function mainReader(options: ReadOptions): Array<{ projectPath: string, mappings: AppUrlConfigs }> {
    const configurations: Array<{ projectPath: string, mappings: AppUrlConfigs }> = [];
    const finder = new FilesFinder(options.fileReadError);
    const reader = new ConfigReader(options.configReadError);

    for (const path of options.paths) {
        const projectPath = finder.projectFinder(path);

        if (projectPath) {
            const urlMappingFiles = finder.urlConfigsFinder();
            const mappings: { [appName: string]: Array<string> } = {};

            for (const urlMappingFile of urlMappingFiles) {
                try {
                    Object.assign(
                        mappings,
                        reader.configsFinder(
                            readFileSync(urlMappingFile, { flag: 'r', encoding: 'utf-8' }),
                            urlMappingFile
                        )
                    );
                } catch (err) {
                    if (err) {
                        options.fileReadError(urlMappingFile);
                    }
                }
            }
            configurations.push({ projectPath, mappings: reader.urlsProcessor(mappings) });
        } else {
            options.notProjectCallback(path);
        }
    }
    return configurations;
}
