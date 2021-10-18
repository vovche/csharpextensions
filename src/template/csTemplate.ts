import { EOL } from 'os';
import Template from './template';

export default class CsTemplate extends Template {
    constructor(name: string, command: string) {
        super(name, command);
    }

    public getExtensions(): string[] {
        return ['.cs'];
    }

    public async create(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        const templatePath = this._getTemplatePath(templatesPath, this.getName());
        const filePath = `${pathWithoutExtension}.cs`;
        const namespaces = [
            'using System;',
            'using System.Collections.Generic;',
            'using System.Linq;',
            'using System.Threading.Tasks;',
            EOL
        ].join(EOL);

        await this._createFile(templatePath, filePath, filename, namespaces);
    }
}
