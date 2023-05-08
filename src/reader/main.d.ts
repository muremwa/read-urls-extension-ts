export type PathConverterTypes = "string" | "slug" | "integer" | "UUID" | "path" | null;

export interface UrlArgument {
    name: string,
    type: PathConverterTypes,
}

export interface ProcessedURL {
    name: string,
    hasArgs: boolean,
    args: Array<UrlArgument>,
    viewName: string
}

export type AppUrlConfigs = Map<string, Array<ProcessedURL>>;

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

type readerConfigErrorCallbacks = (message: string) => void;

export interface ReadOptions {
    paths: Array<string>,
    notProjectCallback: readerConfigErrorCallbacks,
    configReadError: readerConfigErrorCallbacks
    fileReadError: readerConfigErrorCallbacks,
}

interface ProjectReadOutput {
    projectPath: string;
    mappings: AppUrlConfigs;
    models: Map<string, Array<string>>;
}
