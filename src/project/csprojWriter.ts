import * as path from 'path';
import { promises as fs } from 'fs';

import { Builder } from 'xml2js';
import { Uri, window, workspace } from 'vscode';

import ArgumentError from '../argumentError';
import BuildActions from './buildActions';
import { Csproj, IncludableItem, ItemGroup } from './csproj';
import CsprojReader from './csprojReader';
import { isExistingDirectory } from '../pathHelpers';

export default class CsprojWriter extends CsprojReader {
    private readonly xmlBuilder: Builder;

    /**
     * Initializes a new instance for a .csproj-file
     *
     * @param filePath - The path to the .csproj-file
     */
    constructor(filePath: string) {
        super(filePath);

        this.xmlBuilder = new Builder();
    }

    /**
     * Add the file for the given `itemPath` to this csproj, with `buildActionType` as build action
     *
     * @param itemPath The path of the file to add
     * @param buildActionType The build action to set
     */
    public async addBuildActionsForFile(itemPath: string, buildActionType: BuildActions): Promise<void> {
        const buildActionTypeKey = buildActionType as keyof ItemGroup;

        if (!buildActionTypeKey)
            throw new ArgumentError('buildActionType');

        let csproj = await this._getCsproj();

        if (!csproj?.Project)
            throw new ArgumentError('csproj.Project');

        csproj = await this._removeBuildActionsForFile(csproj, itemPath);

        const includePath = this._fixItemPath(itemPath);
        const includableItem = this._createIncludableItem(csproj, includePath, buildActionType);
        const actions = this._ensureActions(csproj, includePath, buildActionTypeKey);

        actions.push(includableItem);

        await this._writeToFile(csproj);
    }

    /**
     * Add the files for the given `itemPaths` to this csproj, with `buildActionType` as build action
     *
     * @param itemPaths The paths of the files to add
     * @param buildActionType The build action to set
     */
    public async addBuildActionsForFiles(itemPaths: string[], buildActionType: BuildActions): Promise<void> {
        const buildActionTypeKey = buildActionType as keyof ItemGroup;

        if (!buildActionTypeKey)
            throw new ArgumentError('buildActionType');

        let csproj = await this._getCsproj();

        if (!csproj?.Project)
            throw new ArgumentError('csproj.Project');

        for (const itemPath of itemPaths) {
            csproj = await this._removeBuildActionsForFile(csproj, itemPath);

            const includePath = this._fixItemPath(itemPath);
            const includableItem = this._createIncludableItem(csproj, includePath, buildActionType);
            const actions = this._ensureActions(csproj, includePath, buildActionTypeKey);

            actions.push(includableItem);
        }

        await this._writeToFile(csproj);
    }

    /**
     * Handle a rename-action for the file with the given `oldItemPath` and `newItemPath` for this csproj
     *
     * @param oldIncludePath The old path of the file
     * @param newIncludePath The new path of the file
     */
    public async handleBuildActionsForRenamedFile(oldItemPath: string, newItemPath: string): Promise<void> {
        const csproj = await this._getCsproj();
        const itemGroups = csproj.Project?.ItemGroup;

        if (!itemGroups) return;

        const isDir = await isExistingDirectory(oldItemPath);

        const oldIncludePath = this._fixItemPath(oldItemPath);
        const newIncludePath = this._fixItemPath(newItemPath);

        for (const itemGroup of itemGroups) {
            let buildActionType: keyof ItemGroup;

            for (buildActionType in itemGroup) {
                const buildActionItems = itemGroup[buildActionType];

                if (!buildActionItems) continue;

                for (const buildActionItem of buildActionItems) {
                    const include = buildActionItem.$.Include;

                    if (!include) continue;

                    if (include === oldIncludePath)
                        buildActionItem.$.Include = newIncludePath;
                    else if (isDir && include.startsWith(oldIncludePath))
                        buildActionItem.$.Include = include.replace(oldIncludePath, newIncludePath);
                }
            }
        }

        await this._writeToFile(csproj);
    }

    /**
     * Remove the file for the given `itemPath` from this csproj
     *
     * @param itemPath The path of the file to remove
     */
    public async removeBuildActionsForFile(itemPath: string): Promise<void> {
        const csproj = await this._getCsproj();
        const updatedCsproj = await this._removeBuildActionsForFile(csproj, itemPath);

        await this._writeToFile(updatedCsproj);
    }

    /**
     * Create a new IncludableItem for the given `includePath` with the given `buildActionType`
     *
     * @param csproj The csproj to create the item for. Used as lookup for an existing page
     * @param includePath The path to create the item for
     * @param buildActionType The build action the item to create is set to
     * @returns The newly created IncludableItem
     */
    private _createIncludableItem(csproj: Csproj, includePath: string, buildActionType: BuildActions): IncludableItem {
        const includableItem: IncludableItem = { $: { Include: includePath } };

        switch (buildActionType) {
            case BuildActions.Compile:
                if (includePath.endsWith('.xaml.cs')) {
                    const pageBuildAction = this._getBuildActionsForFile(csproj, includePath);

                    if (pageBuildAction === BuildActions.Page) {
                        const pagePath = includePath.replace('.cs', '');

                        includableItem.DependentUpon = path.basename(pagePath);
                    }
                }
                break;
            case BuildActions.Page:
                includableItem.SubType = 'Designer';
                includableItem.Generator = 'MSBuild:Compile';
                break;
        }

        return includableItem;
    }

    /**
     * Ensure the actions for the given `includePath` and `buildActionTypeKey` exists (e.g. ItemGroup.Compile)
     *
     * @param csproj The csproj to ensure for
     * @param includePath The path 
     * @param buildActionTypeKey The property key for the ItemGroup to ensure for
     * @returns The ensured actions
     */
    private _ensureActions(csproj: Csproj, includePath: string, buildActionTypeKey: keyof ItemGroup): Array<IncludableItem> {
        if (!csproj.Project)
            throw new ArgumentError('csproj.Project');

        let itemGroups = csproj.Project.ItemGroup;

        if (!itemGroups)
            itemGroups = csproj.Project.ItemGroup = [];

        let itemGroup = this._getItemGroupByPath(itemGroups, includePath);

        if (!itemGroup) {
            itemGroup = {};

            itemGroups.push(itemGroup);
        }

        let actions = itemGroup[buildActionTypeKey];

        if (!actions)
            actions = itemGroup[buildActionTypeKey] = [];

        return actions;
    }

    /**
     * Removes existing build actions for the given `itemPath` from the given `csproj`
     *
     * @param csproj The csproj from which to remove existing build actions
     * @param itemPath The path to look for - ***This should not be an include path, but the original path***
     * @returns The resulting csproj, with removed build actions
     */
    private async _removeBuildActionsForFile(csproj: Csproj, itemPath: string): Promise<Csproj> {
        const itemGroups = csproj.Project?.ItemGroup;

        if (!itemGroups) return csproj;

        const itemGroupsToRemove: Array<ItemGroup> = [];
        const includePath = this._fixItemPath(itemPath);
        const isDir = await isExistingDirectory(itemPath);

        for (const itemGroup of itemGroups) {
            let buildActionType: keyof ItemGroup;

            for (buildActionType in itemGroup) {
                const buildActionItems = itemGroup[buildActionType];

                if (!buildActionItems) continue;

                for (const buildActionItem of buildActionItems) {
                    const include = buildActionItem.$.Include;

                    if (!include) continue;

                    if (include === includePath || (isDir && include.startsWith(includePath))) {
                        const itemIx = buildActionItems.indexOf(buildActionItem);

                        buildActionItems.splice(itemIx, 1);
                    }
                }

                if (!buildActionItems.length)
                    delete itemGroup[buildActionType];
            }

            const itemGroupValues = Object.values(itemGroup) as Array<Array<IncludableItem>>;

            if (!itemGroupValues || !itemGroupValues.length)
                itemGroupsToRemove.push(itemGroup);
        }

        for (const itemGroup of itemGroupsToRemove) {
            const ix = itemGroups.indexOf(itemGroup);

            itemGroups.splice(ix, 1);
        }

        return csproj;
    }

    /**
     * Writes the given `csproj` to the original file path
     *
     * @param csproj The content to serialize & write to the file
     * @param showDocument If the file should be opened in vscode
     */
    private async _writeToFile(csproj: Csproj, showDocument = false): Promise<void> { //TODO: Show document setting
        const content = this.xmlBuilder.buildObject(csproj);

        await fs.writeFile(this.filePath, content);

        if (showDocument) {
            const openedDoc = await workspace.openTextDocument(Uri.file(this.filePath));

            await window.showTextDocument(openedDoc);
        }
    }

    /**
     * Tries to create a new csproj writer from the given path, searched upwards
     *
     * @param findFromPath The path from where to start looking for a .csproj-file
     * @returns A new .csproj-writer if a file is found, or undefined
     */
    public static async CreateWriterFromPath(findFromPath: string, includeProjItems = true): Promise<CsprojWriter | undefined> {
        const filePatterns = ['*.csproj'];

        if (includeProjItems) filePatterns.push('.projitems');

        return await this.CreateProjectFromPath(findFromPath, ...filePatterns);
    }
}
