import Template from './template';

export default class ReswTemplate extends Template {
    constructor(name: string, command: string) {
        super(name, command);
    }

    public getExtensions(): string[] {
        return ['.resw'];
    }

    public async create(templatesPath: string, pathWithoutExtension: string, filename: string): Promise<void> {
        const templatePath = this._getTemplatePath(templatesPath, this.getName());
        const filePath = `${pathWithoutExtension}.resw`;

        await this._createFile(templatePath, filePath, filename);
    }
}
