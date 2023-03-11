import { braceReader, braces } from "./utilities";

export class ConfigReader {
    private appNamePattern = /app_name.*?['"](?<appName>.*?)['"]/;

    /**
     * Presented with a match, return a string or the default
     * */
    private static getGroupMatch(matches: RegExpMatchArray | null, groupName: string, fallback = ''): string {
        if (matches && matches.groups && matches.groups[groupName]) {
            return matches.groups[groupName];
        }
        return fallback;
    }

    /**
     * Gets text from a 'urls.py' file finds the app_name, if any, and the urlspatterns
     * */
    configsFinder (text: string, filePath: string): { [ appName: string ]: Array<string> } {
        const formattedText = text.replace(/""".*?"""/sg, '').replace(/#.*?\n/sg, '')
        // get appName
        const appName: string = ConfigReader.getGroupMatch(
            formattedText.match(this.appNamePattern),
            'appName',
            `READER_FILE_PATH_${filePath}`
        );

        // get URLS from urlpatterns
        const urlPatterns = braceReader(formattedText, braces.SQUARE_BRACKET_OPEN);
        const urls = urlPatterns.map((pattern) => {
            return braceReader(pattern, braces.ROUND_BRACKET_OPEN);
        }).flat();

        return { [appName]: urls }
    }
}