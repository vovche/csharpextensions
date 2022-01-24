import Nameable from './nameable';
import { Parser } from 'xml2js';

export default class CsprojReader implements Nameable {
    private readonly xml: string;
    private readonly xmlParser: Parser;

    /**
     * Initializes a new instance for a .csproj
     * file.
     *
     * @param fileContent - The .csproj file full content
     */
    constructor(fileContent: string) {
        this.xml = fileContent;
        this.xmlParser = new Parser();
    }

    public async getRootNamespace(): Promise<string | undefined> {
        try {
            const result = await this.xmlParser.parseStringPromise(this.xml);

            if (result === undefined
                || result.Project.PropertyGroup === undefined
                || !result.Project.PropertyGroup.length) {
                return;
            }

            let foundNamespace = undefined;

            for (const propertyGroup of result.Project.PropertyGroup) {
                if (propertyGroup.RootNamespace) {
                    foundNamespace = propertyGroup.RootNamespace[0];
                    break;
                }
            }

            return foundNamespace;
        } catch (errParsingXml) {
            console.error('Error parsing project xml', errParsingXml);
        }

        return;
    }

    public async getTargetFramework(): Promise<string | undefined> {
        try {
            const result = await this.xmlParser.parseStringPromise(this.xml);

            if (result === undefined
                || result.Project.PropertyGroup === undefined
                || !result.Project.PropertyGroup.length) {
                return;
            }

            let foundFramework = undefined;

            for (const propertyGroup of result.Project.PropertyGroup) {
                if (propertyGroup.TargetFramework) {
                    foundFramework = propertyGroup.TargetFramework[0];
                    break;
                }
            }

            return foundFramework;
        } catch (errParsingXml) {
            console.error('Error parsing project xml', errParsingXml);
        }

        return;
    }
}
