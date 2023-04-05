export type pathConverterTypes = "string" | "slug" | "integer" | "UUID" | "path" | null;

export interface UrlArgument {
    name: string,
    type: pathConverterTypes,
}

export interface ProcessedURL {
    name: string,
    hasArgs: boolean,
    args: Array<UrlArgument>
}

/**
* base: the current path,
* fileNames: an array of all file names in the path,
* next: function to call in order to continue reading the dirs
*/
export type HandleFilesCallback = (base: string, fileNames: Array<string>, next: () => void) => void;

export interface TraverseOptions {
    // How far/deep to traverse
    depth: number,
    handleFiles: HandleFilesCallback
}