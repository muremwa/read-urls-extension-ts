import { join } from 'path';
import { readdirSync, readFileSync } from "fs";
import { ProcessedURL, UrlArgument, pathConverterTypes, TraverseOptions, AppUrlConfigs, ReadOptions } from './main.d';
import { braceReader, Braces } from "./utilities";

export class ConfigReader {
    /**
     * Read the configurations of a project
     * */
    private patterns = {
        appName: /app_name.*?['"](?<appName>.*?)['"]/,
        reverseName: /\bname=['"](?<name>.*?)['"]/,
        urlArgs: /<.*?>/g
    }
    private pathConverters = new Map<string, pathConverterTypes>([
        ['slug', 'slug'], ['int', 'integer'], ['str', 'string'], ['uuid', 'UUID'], ['path', 'path']
    ]);

    constructor(private errorCallback?: (message: string) => void) {}

    protected static cleanTextBeforeProcessing (text: string): string {
        // Remove new lines, and python comments
        return text.replace(
            /""".*?"""/sg, ''
        ).replace(
            /#.*?\n/sg, ''
        ).replace(
            '\n', ' '
        );
    }

    protected static getGroupMatch(matches: RegExpMatchArray | null, groupName: string, fallback = ''): string {
        // Presented with a match, return a string or the default
        if (matches && matches.groups && matches.groups[groupName]) {
            return matches.groups[groupName];
        }
        return fallback;
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
                    args.push({ name: splitItems[1], type: updArgType? updArgType: null });
                } else if (splitItems.length === 1) {
                    args.push({ name: cleanedMatch, type: null })
                }
            });

            return args;
        }
        return [];
    }

    /**
     * Gets text from a 'urls.py' file finds the app_name, if any, and the urlspatterns
     * */
    configsFinder (text: string, filePath: string): { [ appName: string ]: Array<string> } {
        const formattedText = ConfigReader.cleanTextBeforeProcessing(text);
        // get appName
        const appName: string = ConfigReader.getGroupMatch(
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
    urlsProcessor (configs: { [ appName: string ]: Array<string> }): AppUrlConfigs {
        const processedConfigurations = new Map<string, Array<ProcessedURL>>();

        Object.entries(configs).forEach(([key, urls]) => {
            const processedUrls: Array<ProcessedURL> = [];
            const appHasNoAppName = key.includes('READER_FILE_PATH_');

            urls.forEach((urlText) => {
                const matchedName = ConfigReader.getGroupMatch(
                    urlText.match(this.patterns.reverseName),
                    'name'
                );
                const matchedArgs = urlText.match(this.patterns.urlArgs);

                if (matchedName) {
                    processedUrls.push({
                        name: matchedName,
                        args: this.typePathConverter(matchedArgs),
                        hasArgs: !!matchedArgs,
                        viewName: appHasNoAppName? matchedName: `${key}:${matchedName}`
                    });
                }
            });
            processedConfigurations.set(key, processedUrls);
        });

        return processedConfigurations;
    }
}


export class FilesFinder {
    /**
     * Find the files where django url configurations are declared
     * */

    private ignoredFolders = [
        '.idea','.vscode', '.git', '__pycache__', 'templates',
        'tests', 'media', 'static', 'migrations', 'node_modules',
        'templatetags', 'Scripts', 'Lib', 'Include', '.github', '.gitlab'
    ];

    constructor(private errorCallback?: (message: string) => void) {}

    protected traverseDirs(path: string, options: TraverseOptions) {
        let proceed = false;
        const proceedNextFunc = () => proceed = true;

        const wrappedTraversal = (wrappedPath: string, depth: number) => {
            // this uses a closure to ensure that `proceed` is the same across the stack
            proceed = false;
            const dirents = readdirSync(wrappedPath, { withFileTypes: true });
            const directories = [];
            const files = [];

            for(const dirent of dirents) {
                if (dirent.isFile()) {
                    files.push(dirent.name);
                } else if (dirent.isDirectory() && !this.ignoredFolders.includes(dirent.name)) {
                    directories.push(dirent.name);
                }
            }

            options.handleFiles(wrappedPath, files, proceedNextFunc);

            if (depth > 0) {
                for(const directory of directories) {
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
    urlConfigsFinder(projectPath: string): Array<string> {
        const urlPaths: Array<string> = [];

        this.traverseDirs(projectPath, {
            depth: 2,
            handleFiles: (base, fileNames, next) => {
                if (fileNames.findIndex((fileName) => fileName === 'urls.py') > -1) {
                    urlPaths.push(join(base, 'urls.py'));
                }
                next();
            }
        })
        return urlPaths;
    }

    /**
     * Find the django project home directory.
     * */
    projectFinder(path: string): string | null {
        let projectPath = null;

        this.traverseDirs(path, {
            depth: 5,
            handleFiles: (base, fileNames, next) => {
                if (fileNames.findIndex((fileName) => fileName === 'manage.py') > -1) {
                    projectPath = base;
                } else {
                    next();
                }
            }
        });
        return projectPath;
    }
}


/**
 * Get a list of paths of suspect django projects and return the processed urls
 * */
export default function mainReader(options: ReadOptions): Array<{ projectPath: string, mappings: AppUrlConfigs }> {
    const configurations: Array<{ projectPath: string, mappings: AppUrlConfigs }> = [];
    const finder = new FilesFinder(options.fileReadError);
    const reader = new ConfigReader(options.configReadError);

    for(const path of options.paths) {
        const projectPath = finder.projectFinder(path);

        if (projectPath) {
            const urlMappingFiles = finder.urlConfigsFinder(projectPath);
            const mappings: { [appName: string]: Array<string> } = {};

            for(const urlMappingFile of urlMappingFiles) {
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