import * as path from 'path';
import { promises as fs } from 'fs';

import { Parser } from 'xml2js';

import BuildActions from './buildActions';
import { Csproj, ItemGroup, PropertyGroup } from './csproj';
import ProjectReader from './projectReader';


export default class CsprojReader extends ProjectReader {
    private readonly xmlParser: Parser;

    /**
     * Initializes a new instance for a .csproj-file
     *
     * @param filePath - The path to the .csproj-file
     */
    constructor(filePath: string) {
        super(filePath);

        this.xmlParser = new Parser();
    }

    /**
     * @inheritdoc
     */
    public async getRootNamespace(): Promise<string | undefined> {
        try {
            const propertyGroups = await this._getPropertyGroups();
            const propertyGroupWithRootNamespace = propertyGroups?.find(p => p.RootNamespace);

            if (!propertyGroupWithRootNamespace?.RootNamespace) return;

            return propertyGroupWithRootNamespace.RootNamespace[0];
        } catch (errParsingXml) {
            console.error('Error parsing project xml', errParsingXml);
        }

        return;
    }

    /**
     * Finds and returns the first TargetFramework of this project file
     *
     * @returns The first found TargetFramework of this project file, or undefined
     */
    public async getTargetFramework(): Promise<string | undefined> {
        try {
            const propertyGroups = await this._getPropertyGroups();
            const propertyGroupWithTargetFramework = propertyGroups?.find(p => p.TargetFramework);

            if (!propertyGroupWithTargetFramework?.TargetFramework) return;

            return propertyGroupWithTargetFramework.TargetFramework[0];
        } catch (errParsingXml) {
            console.error('Error parsing project xml', errParsingXml);
        }

        return;
    }

    /**
     * Checks if the file with the given `itemPath` has build actions in this csproj
     *
     * @param itemPath The path to check for
     * @returns If build actions have been found
     */
    public async hasBuildActionsForFile(itemPath: string): Promise<boolean> {
        const csproj = await this._getCsproj();
        const includePath = this._fixItemPath(itemPath);

        return !!this._getBuildActionsForFile(csproj, includePath);
    }

    /**
     * If the target framework for this .csproj is >= .net6.0
     *
     * @returns If the target framework for this .csproj is >= .net6.0, undefined if no target framework is found
     */
    public async isTargetFrameworkHigherThanOrEqualToDotNet6(): Promise<boolean | undefined> {
        const targetFramework = await this.getTargetFramework();

        if (!targetFramework) return; // No target framework found

        const versionMatch = targetFramework.match(/(?<=net)\d+(\.\d+)*/i); // Match .NET version string like "net6.0"

        if (!versionMatch?.length || Number.isNaN(versionMatch[0])) return false;

        return Number(versionMatch[0]) >= 6;
    }

    /**
     * Fix the given `itemPath` for use as includePath
     *
     * @param itemPath The path to fix
     * @returns The fixed includePath
     */
    protected _fixItemPath(itemPath: string): string {
        return itemPath.replace(
            path.dirname(this.filePath) + path.sep,
            path.extname(this.filePath) === '.projitems' ? '$(MSBuildThisFileDirectory)' : ''
        );
    }

    /**
     * Retrieves the build actions for the file with the given `includePath` from the given `csproj`
     *
     * @param csproj The csproj to find the build actions in
     * @param includePath The path to look for
     * @returns The found build actions, or `undefined`
     */
    protected _getBuildActionsForFile(csproj: Csproj, includePath: string): BuildActions | undefined {
        if (!csproj.Project?.ItemGroup) return;

        for (const itemGroup of csproj.Project.ItemGroup) {
            let buildActionType: keyof ItemGroup;

            for (buildActionType in itemGroup) {
                const buildActionItems = itemGroup[buildActionType];
                const foundBuildAction = buildActionItems?.find(t => t.$.Include === includePath);

                if (foundBuildAction)
                    return buildActionType as BuildActions;
            }
        }

        return;
    }

    /**
     * Retrieve the content of this project file
     *
     * @returns The content of this project file
     */
    protected async _getContent(): Promise<string> {
        return await fs.readFile(this.filePath, 'utf-8');
    }

    /**
     * Retrieves and parses the content of this project file
     *
     * @returns The parsed xml content of this project file
     */
    protected async _getCsproj(): Promise<Csproj> {
        const content = await this._getContent();

        return await this.xmlParser.parseStringPromise(content);
    }

    /**
     * Retrieves the item group with the given `includePath` from the given `itemGroups`
     *
     * @param itemGroups The item groups to look through
     * @param includePath The path to look for
     * @returns The found item group, or `undefined`
     */
    protected _getItemGroupByPath(itemGroups: Array<ItemGroup>, includePath: string): ItemGroup | undefined {
        for (const itemGroup of itemGroups) {
            let buildActionType: keyof ItemGroup;

            for (buildActionType in itemGroup) {
                const buildActionItems = itemGroup[buildActionType];
                const foundBuildAction = buildActionItems?.find(t => t.$.Include === includePath);

                if (foundBuildAction)
                    return itemGroup;
            }
        }

        return;
    }

    /**
     * Retrieves the property groups of this project file
     *
     * @returns The property groups of this project file
     */
    protected async _getPropertyGroups(): Promise<Array<PropertyGroup> | undefined> {
        const xmlContent = await this._getCsproj();

        return xmlContent?.Project?.PropertyGroup;
    }

    /**
     * @inheritdoc
     */
    protected _getSupportedExtensions(): Array<string> {
        return ['.csproj', '.projitems'];
    }

    /**
     * Tries to create a new csproj reader from the given path, searched upwards
     *
     * @param findFromPath The path from where to start looking for a .csproj-file
     * @returns A new .csproj-reader if a file is found, or undefined
     */
    public static async CreateReaderFromPath(findFromPath: string): Promise<CsprojReader | undefined> {
        return await this.CreateProjectFromPath(findFromPath, '*.csproj');
    }
}
