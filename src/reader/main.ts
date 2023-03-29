import { braceReader, braces } from "./utilities";
import { ProcessedURL, UrlArgument, pathConverterTypes } from './main.d';
import { WalkStatArrayEventCallback, walkSync } from "walk";
import { join } from 'path';

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
        ['slug', 'slug'],
        ['int', 'integer'],
        ['str', 'string'],
        ['uuid', 'UUID'],
        ['path', 'path']
    ]);

    constructor(private errorCallback?: (message: string) => void) {}

    private static cleanTextBeforeProcessing (text: string): string {
        // Remove new lines, and python comments
        return text.replace(
            /""".*?"""/sg, ''
        ).replace(
            /#.*?\n/sg, ''
        ).replace(
            '\n', ' '
        );
    }

    private static getGroupMatch(matches: RegExpMatchArray | null, groupName: string, fallback = ''): string {
        // Presented with a match, return a string or the default
        if (matches && matches.groups && matches.groups[groupName]) {
            return matches.groups[groupName];
        }
        return fallback;
    }

    private typePathConverter(matches: RegExpMatchArray | null): Array<UrlArgument> {
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
            const urlPatterns = braceReader(formattedText, braces.SQUARE_BRACKET_OPEN);
            urls = urlPatterns.map((pattern) => {
                return braceReader(pattern, braces.ROUND_BRACKET_OPEN);
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
    urlsProcessor (configs: { [ appName: string ]: Array<string> }): Map<string, Array<ProcessedURL>> {
        const processedConfigurations = new Map<string, Array<ProcessedURL>>();

        Object.entries(configs).forEach(([key, urls]) => {
            const processedUrls: Array<ProcessedURL> = [];

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
                        hasArgs: !!matchedArgs
                    })
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
     * TODO: Find an alternative to walk, since it traverses the directories bottom-to-top
     * */

    private ignoredFolders = [
        '.idea','.vscode', '.git', '__pycache__', 'templates',
        'tests', 'media', 'static', 'migrations', 'node_modules',
        'templatetags', 'Scripts', 'Lib', 'Include'
    ];

    /**
     * Get a home directory of django project and find all 'urls.py'
     * */
    urlConfigsFinder(projectPath: string): Array<string> {
        const urlPaths: Array<string> = [];

        const finderCallback: WalkStatArrayEventCallback = (base, details, next) => {
            if (details.findIndex((detail) => detail.name === 'urls.py') > -1) {
                urlPaths.push(join(base, 'urls.py'));
            }
            next();
        }
        walkSync(projectPath, {
            filters: this.ignoredFolders,
            listeners: {
                files: finderCallback
            }
        })
        return urlPaths;
    }

    /**
     * Find the django project home directory.
     * */
    projectFinder(path: string): string | null {
        let projectPath = null;

        walkSync(path, {
            filters: this.ignoredFolders,
            listeners: {
                files: (base, details, next) => {
                    if (details.findIndex((detail) => detail.name === 'manage.py') > -1) {
                        projectPath = base;
                    } else {
                        next();
                    }
                }
            }
        })
        return projectPath;
    }
}
