interface OrgMetadata {
    title?: string;
    author?: string;
    date?: string;
    email?: string;
    description?: string;
    keywords?: string[];
    language?: string;
    category?: string;
    tags?: string[];
    options?: Record<string, any>;
    properties?: Record<string, string>;
    slug?: string;
    coverImage?: string;
    canonical?: string;
    readingTime?: number;
    wordCount?: number;
    excerpt?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogType?: string;
    twitterCard?: string;
    twitterSite?: string;
    twitterCreator?: string;
    themeColor?: string;
    robots?: string;
    [key: string]: any;
}
interface OrgOptions {
    toc?: boolean | number;
    num?: boolean;
    date?: boolean;
    H?: number;
    author?: boolean;
    email?: boolean;
    title?: boolean;
    [key: string]: any;
}
interface RenderOptions {
    template?: string;
    templateDir?: string;
    sanitize?: boolean;
    allowRawHtml?: boolean;
    codeHighlight?: boolean;
    fetchRemoteAssets?: 'none' | 'metadata' | 'full';
    maxAssetSize?: number;
    baseUrl?: string;
    componentMap?: Record<string, string>;
}
interface AssetMetadata {
    url: string;
    type?: string;
    width?: number;
    height?: number;
    size?: number;
    lqip?: string;
}
interface RenderResult {
    html: string;
    metadata: OrgMetadata;
    assets?: AssetMetadata[];
}
type NodeType = 'document' | 'heading' | 'paragraph' | 'list' | 'listItem' | 'table' | 'tableRow' | 'tableCell' | 'codeBlock' | 'quote' | 'example' | 'verse' | 'center' | 'drawer' | 'propertyDrawer' | 'shortcode' | 'text' | 'bold' | 'italic' | 'underline' | 'code' | 'verbatim' | 'strike' | 'link' | 'image' | 'footnote' | 'lineBreak' | 'rawHtml';
interface AstNode {
    type: NodeType;
    children?: AstNode[];
    value?: string;
    properties?: Record<string, any>;
    position?: {
        start: {
            line: number;
            column: number;
        };
        end: {
            line: number;
            column: number;
        };
    };
}
interface OrgAst extends AstNode {
    type: 'document';
    metadata: OrgMetadata;
    children: AstNode[];
}
interface OrgPlugin {
    name: string;
    blockHandlers?: Record<string, (node: AstNode, context: any) => string>;
    inlineHandlers?: Record<string, (node: AstNode, context: any) => string>;
    metadataProcessor?: (metadata: OrgMetadata) => OrgMetadata;
    postProcessor?: (html: string, metadata: OrgMetadata) => Promise<string>;
}
interface BuildConfig {
    input: string;
    output: string;
    template?: string;
    config?: string;
    fetchRemoteAssets?: 'none' | 'metadata' | 'full';
    maxAssetSize?: number;
    baseUrl?: string;
    sanitize?: boolean;
    allowRawHtml?: boolean;
    codeHighlight?: boolean;
    componentMap?: Record<string, string>;
}

declare function parse(content: string): OrgAst;

declare function renderToHtml(ast: OrgAst, options?: RenderOptions): Promise<RenderResult>;

declare function applyTemplate(html: string, metadata: OrgMetadata, templatePath?: string, templateDir?: string): Promise<string>;

declare function org2html(orgContent: string, options?: RenderOptions): Promise<RenderResult>;

export { type AssetMetadata, type AstNode, type BuildConfig, type NodeType, type OrgAst, type OrgMetadata, type OrgOptions, type OrgPlugin, type RenderOptions, type RenderResult, applyTemplate, org2html, parse, renderToHtml };
