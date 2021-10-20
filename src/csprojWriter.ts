import * as path from 'path';
import { promises as fs } from 'fs';

import * as findupglob from 'find-up-glob';
import { Builder, Parser } from 'xml2js';

export enum BuildActions {
    Folder = 'Folder',
    Compile = 'Compile',
    Content = 'Content',
    EmbeddedResource = 'EmbeddedResource',
    PRIResource = 'PRIResource',
    Page = 'Page',
    None = 'None',
}

export class CsprojWriter {
    public async getProjFilePath(filePath: string): Promise<string | undefined> {
        const projItems: string[] = await findupglob('*.projitems', { cwd: path.dirname(filePath) });
        const csProj: string[] = await findupglob('*.csproj', { cwd: path.dirname(filePath) });

        if (projItems !== null && projItems.length >= 1) return projItems[0];
        else if (csProj !== null && csProj.length >= 1) return csProj[0];

        return;
    }

    public async add(projPath: string, itemPaths: string[], itemType: BuildActions) {
        const paths: Array<string> = [];

        for (const itemPath of itemPaths) {
            const path = this.fixItemPath(projPath, itemPath);
            const buildAction = await this.get(projPath, path);

            paths.push(path);

            if (buildAction !== undefined) await this.remove(projPath, path);
        }

        const parsedXml = await this.parseProjFile(projPath);

        if (!parsedXml) return;

        let items: Array<any> = parsedXml.Project.ItemGroup;

        if (!items) {
            items = parsedXml.Project.ItemGroup = [];
        }

        for (const includePath of paths) {
            const item: any = {
                [itemType]: {
                    $: {
                        'Include': includePath
                    }
                }
            };
            const itemGroup = this.getItemGroupByPath(items, includePath);

            if (itemType === BuildActions.Compile && includePath.endsWith('.xaml.cs')) {
                const pagePath = includePath.replace('.cs', '');
                const pageBuildAction = await this.get(projPath, pagePath);

                if (pageBuildAction === BuildActions.Page) item[itemType].DependentUpon = path.basename(pagePath);
            } else if (itemType === BuildActions.Page) {
                item[itemType].SubType = 'Designer';
                item[itemType].Generator = 'MSBuild:Compile';
            }

            if (itemGroup) {
                const actions: Array<any> | undefined = itemGroup[itemType];

                if (actions) {
                    actions.push(item[itemType]);
                } else {
                    const array: Array<any> = [];

                    array[0] = item[itemType];

                    itemGroup[itemType] = array;
                }
            } else {
                const array: Array<any> = [];

                array[0] = item[itemType];

                items.push({ [itemType]: array });
            }
        }

        await fs.writeFile(projPath, new Builder().buildObject(parsedXml));
    }

    public async get(projPath: string, itemPath: string): Promise<BuildActions | undefined> {
        itemPath = this.fixItemPath(projPath, itemPath);

        const parsedXml = await this.parseProjFile(projPath);

        if (!parsedXml) return;

        const items: Array<any> = parsedXml.Project.ItemGroup;

        if (items) {
            for (const item of items) {
                const actions = Object.values(item)[0] as Array<any>;

                if (actions) {
                    for (const action of actions) {
                        if (action.$.Include  === itemPath) {
                            return BuildActions[Object.getOwnPropertyNames(item)[0] as keyof typeof BuildActions];
                        }
                    }
                }
            }
        }

        return;
    }

    public async remove(projPath: string, itemPath: string): Promise<void> {
        let isDir = false;

        try {
            const fileStat = await fs.lstat(itemPath);

            isDir = fileStat.isDirectory();
        } catch { }

        itemPath = this.fixItemPath(projPath, itemPath);

        const parsedXml = await this.parseProjFile(projPath);

        if (!parsedXml) return;

        const items: Array<any> = parsedXml.Project.ItemGroup;

        for (const item of items) {
            const actionsArray = Object.values(item) as Array<Array<any>>;

            for (const actions of actionsArray) {
                for (const action of actions) {
                    const include = action.$.Include;

                    if (include === itemPath || (isDir && include.startsWith(itemPath))) {
                        actions.splice(action, 1);
                    }
                }

                if (actions.length === 0) actionsArray.splice(actionsArray.indexOf(actions), 1);
            }

            if (actionsArray.length === 0) items.splice(items.indexOf(item), 1);
        }

        await fs.writeFile(projPath, new Builder().buildObject(parsedXml));
    }

    public async rename(projPath: string, oldItemPath: string, newItemPath: string): Promise<void> {
        let isDir = false;

        try {
            const fileStat = await fs.lstat(oldItemPath);

            isDir = fileStat.isDirectory();
        } catch { }

        oldItemPath = this.fixItemPath(projPath, oldItemPath);
        newItemPath = this.fixItemPath(projPath, newItemPath);

        const parsedXml = await this.parseProjFile(projPath);

        if (parsedXml === undefined) return;

        const items: Array<any> = parsedXml.Project.ItemGroup;

        for (const item of items) {
            const actionsArray = Object.values(item) as Array<Array<any>>;

            for (const actions of actionsArray) {
                for (const action of actions) {
                    const include = action.$.Include;

                    if (include === oldItemPath) {
                        action.$.Include = newItemPath;
                    } else if (isDir && include.startsWith(oldItemPath)) {
                        action.$.Include = include.replace(oldItemPath, newItemPath);
                    }
                }
            }
        }

        await fs.writeFile(projPath, new Builder().buildObject(parsedXml));
    }

    private async parseProjFile(projPath: string): Promise<any | undefined> {
        const xml = await fs.readFile(projPath, 'utf8');
        const xmlParser = new Parser();
        const parsedXml = await xmlParser.parseStringPromise(xml);

        if (!parsedXml || !parsedXml.Project) return;

        return parsedXml;
    }

    private getItemGroupByPath(itemGroups: Array<any>, itemPath: string): any | undefined {
        for (const itemGroup of itemGroups) {
            const actionsArray = Object.values(itemGroup) as Array<Array<any>>;

            for (const actions of actionsArray) {
                for (const action of actions) {
                    if (path.dirname(action.$.Include) === path.dirname(itemPath)) {
                        return itemGroup;
                    }
                }
            }
        }

        return;
    }

    private fixItemPath(projPath: string, itemPath: string): string {
        return itemPath.replace(
            path.dirname(projPath) + path.sep,
            path.extname(projPath) === '.projitems' ? '$(MSBuildThisFileDirectory)' : ''
        );
    }
}
