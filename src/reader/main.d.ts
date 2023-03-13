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