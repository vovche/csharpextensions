import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import NamespaceDetector from '../../src/namespaceDetector';

const fixture_path= path.resolve(__dirname, '../suite/');
const fixtureReader = 
{
    filename: 'namespacedetector.csproj',
    csproj: `
    <Project Sdk="Microsoft.NET.Sdk">
        <PropertyGroup>
            <TargetFramework>net6.0</TargetFramework>
        </PropertyGroup>
    </Project>
    `, 
};
const fixtureJson =
{
    filename: 'project.json',
    json: '{"tooling": {"defaultNamespace":"CsharpExtension.Test"}}',
};

suite('NameSpaceDetector', () => {
    test('getNameSpace when csproj file is defined, returns root namespace', async () => {
        const filePath = `${fixture_path}${path.sep}${fixtureReader.filename}`;
        const expectedNamespace = 'suite';
        fs.writeFileSync(filePath, fixtureReader.csproj);
        const nameSpaceDetector = new NamespaceDetector(filePath);
        const result = await nameSpaceDetector.getNamespace();
        fs.unlinkSync(filePath);
        assert.strictEqual(result, expectedNamespace);
    });

    test('getNameSpace when json project file is defined, returns root namespace', async () => {
        const filePath = `${fixture_path}${path.sep}${fixtureJson.filename}`;
        const expectedNamespace = 'CsharpExtension.Test';
        fs.writeFileSync(filePath, fixtureJson.json);
        const nameSpaceDetector = new NamespaceDetector(filePath);
        const result = await nameSpaceDetector.getNamespace();
        fs.unlinkSync(filePath);
        assert.strictEqual(result, expectedNamespace);
    });

    test('getNameSpace when not existing project file and no workspace folder set, returns empty namespace', async () => {
        const filePath = path.resolve(fixture_path, '/not-existing-project-file');
        const namespaceDetector = new NamespaceDetector(filePath);
        const result = await namespaceDetector.getNamespace();
        assert.strictEqual(result, '');
    });
});
