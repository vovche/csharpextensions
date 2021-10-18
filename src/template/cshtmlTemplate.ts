import { EOL } from 'os';
import Template from './template';

export default class CshtmlTemplate extends Template {
    constructor(name: string, command: string) {
        super(name, command);
    }

    public getExtensions(): string[] {
        return ['.cshtml', '.cshtml.cs'];
    }

    public async create(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        const cshtmlTemplatePath = this._getTemplatePath(templatesPath, this.getName());
        const csTemplatePath = this._getTemplatePath(templatesPath, `${this.getName()}.cs`);
        const cshtmlFilePath = `${pathWithoutExtension}.xaml`;
        const csFilePath = `${pathWithoutExtension}.xaml.cs`;
        const namespaces = [
            'using System;',
            'using System.Collections.Generic;',
            'using System.Linq;',
            'using System.Threading.Tasks;',
            EOL
        ].join(EOL);

        await this._createFile(csTemplatePath, csFilePath, filename, namespaces);
        await this._createFile(cshtmlTemplatePath, cshtmlFilePath, filename);
    }
}
