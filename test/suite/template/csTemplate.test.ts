import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

import CsTemplate from '../../../src/template/csTemplate';
// import { ExtensionError } from '../../../src/util';

const templates_path = path.resolve(__dirname, '../../../../templates/');
const fixture_path= path.resolve(__dirname, '../../suite/');
const fixtureCsTemplate = 
{
    filename: 'cstemplate.csproj',
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

suite('CsTemplate', () => {
    test('create cs template when wrong template path, throws exception', () => {
        const csTemplate = new CsTemplate('test', 'createClass',);

        return csTemplate.create('notExsistingTemplate', 'testfilePath', 'test')
            .catch((err) => {
                const unexpectedPath = `notExsistingTemplate${path.sep}test.tmpl`;
                assert.strictEqual(err.message, `Could not read template file from '${unexpectedPath}'`);
            });
    });

    // FIXME: this test should fail with a different error
    // Expected something like "Error trying to write to ..."
    // or eventually a more difensive approach just validating the 3 input parameters.
    // Is currently fine for the method to accept empty path and to write a file with the name .cs
    // which shouldn't happen
    // test('create cs template when not existing file path, throws exception', () => {
    //     const csTemplate = new CsTemplate('Class', 'createClass',);

    //     return csTemplate.create(templates_path, '', '')
    //         .catch((err) => {
    //             assert.strictEqual(err.message, 'Error trying to open from \'.cs\'');
    //         });
    // });

    const components : Array<string> = [
        'Class',
        'Interface',
        'Struct',
        'Enum',
    ];
    components.forEach(component => {
        test(`create cs template for ${component}, when no csproj file - expected file default configuration`, () => {
            const usingFancyLibrary = 'Fancy.Library.Test';
            const namespaces = [];
            if (component !== 'Enum') {
                namespaces.push(usingFancyLibrary);
            }

            const csTemplate = new CsTemplate(component, `create${component}`, namespaces);
            const filename = `${component}DefaultConfig`;
            const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;
            const regEx = path.sep === '/' ? /\//g : /\\/g;
            const index = path.sep === '/' ? 1 : 3;

            const expectedNamespace = fixture_path.substring(index).replace(regEx, '.');

            return csTemplate.create(templates_path, pathWithoutExtension, filename)
                .then(() => {
                    assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cs`), true);
                    const content = fs.readFileSync(`${pathWithoutExtension}.cs`).toString();
                    if (component !== 'Enum') {
                        assert.strictEqual(content.includes(`using ${usingFancyLibrary}`), true);
                    }

                    assert.strictEqual(content.includes(`namespace ${expectedNamespace}`), true);
                    assert.strictEqual(content.includes(`${component.toLowerCase()} ${filename}`), true);
                    fs.unlinkSync(`${pathWithoutExtension}.cs`);
                });
        });

        test(`create cs template for ${component}, when has csproj file - expected file default configuration`, () => {
            const usingFancyLibrary = 'Fancy.Library.Test';
            const namespaces = [];
            if (component !== 'Enum') {
                namespaces.push(usingFancyLibrary);
            }

            const csTemplate = new CsTemplate(component, `create${component}`, namespaces);
            const filename = `${component}NewFileProj`;
            const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;
            const csprojPath = `${fixture_path}${path.sep}${fixtureCsTemplate.filename}`;
            fs.writeFileSync(csprojPath, fixtureCsTemplate.csproj);

            return csTemplate.create(templates_path, pathWithoutExtension, filename)
                .then(() => {
                    assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cs`), true);
                    const eolSetting: string|undefined = vscode.workspace.getConfiguration().get('files.eol');
                    const includeNamespaces = vscode.workspace.getConfiguration().get('csharpextensions.includeNamespaces');
                    // lines from the class template plus eventually the namespaces
                    const expectedLines = component === 'Enum'? 7 : !includeNamespaces ? 8 : 13;
                    const eol = expectedEol(eolSetting);
                    const content = fs.readFileSync(`${pathWithoutExtension}.cs`).toString();
                    const lines = content.split(eol);
                    assert.strictEqual(lines.length, expectedLines);
                    if (component !== 'Enum') {
                        assert.strictEqual(content.includes(`using ${usingFancyLibrary}`), true);
                    }

                    assert.strictEqual(content.includes('namespace suite'), true);
                    assert.strictEqual(content.includes(`${component.toLowerCase()} ${filename}`), true);
                    fs.unlinkSync(`${pathWithoutExtension}.cs`);
                    fs.unlinkSync(csprojPath);
                });
        });
    });

    test('create cs template for controller, when no csproj file - expected file default configuration', () => {
        const usingFancyLibrary = 'Fancy.Library.Test';
        const csTemplate = new CsTemplate('Controller', 'createController', [usingFancyLibrary]);
        const filename = 'ControllerDefaultConfig';
        const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;
        const regEx = path.sep === '/' ? /\//g : /\\/g;
        const index = path.sep === '/' ? 1 : 3;

        const expectedNamespace = fixture_path.substring(index).replace(regEx, '.');

        return csTemplate.create(templates_path, pathWithoutExtension, filename)
            .then(() => {
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cs`), true);
                const content = fs.readFileSync(`${pathWithoutExtension}.cs`).toString();
                assert.strictEqual(content.includes(`using ${usingFancyLibrary}`), true);
                assert.strictEqual(content.includes(`namespace ${expectedNamespace}`), true);
                assert.strictEqual(content.includes(`class ${filename}`), true);
                fs.unlinkSync(`${pathWithoutExtension}.cs`);
            });
    });

    test('create cs template for Controller, when has csproj file - expected file default configuration', () => {
        const usingFancyLibrary = 'Fancy.Library.Test';
        const csTemplate = new CsTemplate('Controller', 'createController', [usingFancyLibrary]);
        const filename = 'ControllerNewFileProj';
        const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;
        const csprojPath = `${fixture_path}${path.sep}${fixtureCsTemplate.filename}`;
        fs.writeFileSync(csprojPath, fixtureCsTemplate.csproj);

        return csTemplate.create(templates_path, pathWithoutExtension, filename)
            .then(() => {
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cs`), true);
                const eolSetting: string|undefined = vscode.workspace.getConfiguration().get('files.eol');
                // lines from the class template plus eventually the namespaces
                const expectedLines = 30;
                const eol = expectedEol(eolSetting);
                const content = fs.readFileSync(`${pathWithoutExtension}.cs`).toString();
                const lines = content.split(eol);
                assert.strictEqual(lines.length, expectedLines);
                assert.strictEqual(content.includes(`using ${usingFancyLibrary}`), true);
                assert.strictEqual(content.includes('namespace suite'), true);
                assert.strictEqual(content.includes(`class ${filename}`), true);
                fs.unlinkSync(`${pathWithoutExtension}.cs`);
                fs.unlinkSync(csprojPath);
            });
    });

    test('create cs template for api controller, when no csproj file - expected file default configuration', () => {
        const usingFancyLibrary = 'Fancy.Library.Test';
        const csTemplate = new CsTemplate('ApiController', 'createApiController', [usingFancyLibrary]);
        const filename = 'ApiControllerDefaultConfig';
        const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;
        const regEx = path.sep === '/' ? /\//g : /\\/g;
        const index = path.sep === '/' ? 1 : 3;

        const expectedNamespace = fixture_path.substring(index).replace(regEx, '.');

        return csTemplate.create(templates_path, pathWithoutExtension, filename)
            .then(() => {
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cs`), true);
                const content = fs.readFileSync(`${pathWithoutExtension}.cs`).toString();
                assert.strictEqual(content.includes(`using ${usingFancyLibrary}`), true);
                assert.strictEqual(content.includes(`namespace ${expectedNamespace}`), true);
                assert.strictEqual(content.includes(`class ${filename}`), true);
                fs.unlinkSync(`${pathWithoutExtension}.cs`);
            });
    });

    test('create cs template for Api Controller, when has csproj file - expected file default configuration', () => {
        const usingFancyLibrary = 'Fancy.Library.Test';
        const csTemplate = new CsTemplate('ApiController', 'createApiController',  [usingFancyLibrary]);
        const filename = 'ApiControllerNewFileProj';
        const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;
        const csprojPath = `${fixture_path}${path.sep}${fixtureCsTemplate.filename}`;
        fs.writeFileSync(csprojPath, fixtureCsTemplate.csproj);

        return csTemplate.create(templates_path, pathWithoutExtension, filename)
            .then(() => {
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.cs`), true);
                const eolSetting: string|undefined = vscode.workspace.getConfiguration().get('files.eol');
                // lines from the class template plus eventually the namespaces
                const expectedLines = 15;
                const eol = expectedEol(eolSetting);
                const content = fs.readFileSync(`${pathWithoutExtension}.cs`).toString();
                const lines = content.split(eol);
                assert.strictEqual(lines.length, expectedLines);
                assert.strictEqual(content.includes(`using ${usingFancyLibrary}`), true);
                assert.strictEqual(content.includes('namespace suite'), true);
                assert.strictEqual(content.includes(`class ${filename}`), true);
                fs.unlinkSync(`${pathWithoutExtension}.cs`);
                fs.unlinkSync(csprojPath);
            });
    });
});
