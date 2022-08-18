import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

import CshtmlTemplate from '../../../src/template/cshtmlTemplate';

const templates_path = path.resolve(__dirname, '../../../../templates/');
const fixture_path= path.resolve(__dirname, '../../suite/');
const fixtureCshtmlTemplate = 
{
    filename: 'cshtmltemplate.csproj',
    csproj: `
    <Project Sdk="Microsoft.NET.Sdk">
        <PropertyGroup>
            <TargetFramework>net6.0</TargetFramework>
        </PropertyGroup>
    </Project>
    `, 
};
const expectedEol = (eolSettings: string|undefined): string => {
    switch (eolSettings) {
        case '\n':
            return '\n';
        case '\r\n':
            return '\r\n';
        default:
        case 'auto':
            return os.EOL;
    }
};

suite('CshtmlTemplate', () => {
    test('create razor template when wrong template path, throws exception', () => {
        const cshtmlTemplate = new CshtmlTemplate('test', 'createClass',);

        return cshtmlTemplate.create('notExsistingTemplate', 'testfilePath', 'test')
            .catch((err) => {
                const unexpectedPath = `notExsistingTemplate${path.sep}test.cs.tmpl`;
                assert.strictEqual(err.message, `Could not read template file from '${unexpectedPath}'`);
            });
    });

    test('create razor page, when no csproj file - expected file default configuration', () => {
        const usingFancyLibrary = 'Fancy.Library.Test';
        const cshtmlTemplate = new CshtmlTemplate('Razor_Page', 'createRazorPage', [usingFancyLibrary]);
        const filename = 'RazorNoCsProj';
        const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;
        const regEx = path.sep === '/' ? /\//g : /\\/g;
        const index = path.sep === '/' ? 1 : 3;

        const expectedNamespace = fixture_path.substring(index).replace(regEx, '.');

        return cshtmlTemplate.create(templates_path, pathWithoutExtension, filename)
            .then(() => {
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cshtml.cs`), true);
                const contentCs = fs.readFileSync(`${pathWithoutExtension}.cshtml.cs`).toString();
                assert.strictEqual(contentCs.includes(`using ${usingFancyLibrary}`), true);
                assert.strictEqual(contentCs.includes(`namespace ${expectedNamespace}`), true);
                assert.strictEqual(contentCs.includes(`class ${filename}`), true);
                fs.unlinkSync(`${pathWithoutExtension}.cshtml.cs`);
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cshtml`), true);
                const contentCshtml = fs.readFileSync(`${pathWithoutExtension}.cshtml`).toString();
                assert.strictEqual(contentCshtml.includes('@page'), true);
                assert.strictEqual(contentCshtml.includes(`@model ${expectedNamespace}.${filename}`), true);
                assert.strictEqual(contentCshtml.includes(`ViewData["Title"] = "${filename}";`), true);
                assert.strictEqual(contentCshtml.includes('<h1>@ViewData["Title"]</h1>'), true);
                assert.strictEqual(contentCshtml.includes('<div>'), true);
                assert.strictEqual(contentCshtml.includes('</div>'), true);
                fs.unlinkSync(`${pathWithoutExtension}.cshtml`);
            });
    });

    test('create razor, when has csproj file - expected file default configuration', () => {
        const usingFancyLibrary = 'Fancy.Library.Test';
        const cshtmlTemplate = new CshtmlTemplate('Razor_Page', 'createRazorPage', [usingFancyLibrary]);
        const filename = 'RazorFileProj';
        const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;
        const csprojPath = `${fixture_path}${path.sep}${fixtureCshtmlTemplate.filename}`;
        fs.writeFileSync(csprojPath, fixtureCshtmlTemplate.csproj);

        return cshtmlTemplate.create(templates_path, pathWithoutExtension, filename)
            .then(() => {
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cshtml.cs`), true);
                const eolSetting: string|undefined = vscode.workspace.getConfiguration().get('files.eol');
                // lines from the class template plus eventually the namespaces
                const expectedLines = 22;
                const eol = expectedEol(eolSetting);
                const contentCs = fs.readFileSync(`${pathWithoutExtension}.cshtml.cs`).toString();
                const lines = contentCs.split(eol);
                assert.strictEqual(lines.length, expectedLines);
                assert.strictEqual(contentCs.includes(`using ${usingFancyLibrary}`), true);
                assert.strictEqual(contentCs.includes('namespace suite'), true);
                assert.strictEqual(contentCs.includes(`class ${filename}`), true);
                fs.unlinkSync(`${pathWithoutExtension}.cshtml.cs`);
                fs.unlinkSync(csprojPath);
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cshtml`), true);
                const contentCshtml = fs.readFileSync(`${pathWithoutExtension}.cshtml`).toString();
                assert.strictEqual(contentCshtml.includes('@page'), true);
                assert.strictEqual(contentCshtml.includes(`@model suite.${filename}`), true);
                assert.strictEqual(contentCshtml.includes(`ViewData["Title"] = "${filename}";`), true);
                assert.strictEqual(contentCshtml.includes('<h1>@ViewData["Title"]</h1>'), true);
                assert.strictEqual(contentCshtml.includes('<div>'), true);
                assert.strictEqual(contentCshtml.includes('</div>'), true);
                fs.unlinkSync(`${pathWithoutExtension}.cshtml`);
            });
    });
});
