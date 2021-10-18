import { EOL } from 'os';
import { Template } from './template';

export class XamlTemplate extends Template {
    constructor(name: string, command: string) {
        super(name, command);
    }

    public getExtensions(): string[] {
        return ['.xaml', '.xaml.cs'];
    }

    public async create(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        const xamlTemplatePath = this._getTemplatePath(templatesPath, this.getName());
        const csTemplatePath = this._getTemplatePath(templatesPath, `${this.getName()}.cs`);
        const xamlFilePath = `${pathWithoutExtension}.xaml`;
        const csFilePath = `${pathWithoutExtension}.xaml.cs`;
        const namespaces = [
            'using System;',
            'using System.Collections.Generic;',
            'using System.Linq;',
            'using System.Text;',
            'using System.Threading.Tasks;',
            'using System.Windows.Data;',
            'using System.Windows.Documents;',
            'using System.Windows.Input;',
            'using System.Windows.Media;',
            'using System.Windows.Media.Imaging;',
            'using System.Windows.Navigation;',
            'using System.Windows.Shapes;',
            EOL
        ].join(EOL);

        await this._createFile(csTemplatePath, csFilePath, filename, namespaces);
        await this._createFile(xamlTemplatePath, xamlFilePath, filename);
    }
}
