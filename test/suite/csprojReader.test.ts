import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import CsprojReader from '../../src/project/csprojReader';

const fixture_path= path.resolve(__dirname, '../suite/');
interface Fixture {
    filename: string,
    csproj : string,
    expected : string | undefined,
}

suite('CsprojReader', () => {
    const validTargetFramework : Array<string> = [
        'netcoreapp1.0',
        'netcoreapp1.1',
        'netcoreapp2.0',
        'netcoreapp2.1',
        'netcoreapp2.2',
        'netcoreapp3.0',
        'netcoreapp3.1',
        'net5.0',
        'net6.0',
    ];

    const rootNameSpacefixtures : Array<Fixture> = [
        {
            filename: 'xamarin.csproj',
            csproj: `
            <Project Sdk="Microsoft.NET.Sdk">
                <PropertyGroup>
                    <RootNamespace>Xamarin.Forms</RootNamespace>
                </PropertyGroup>
            </Project>`, 
            expected: 'Xamarin.Forms',
        },
        {
            filename: 'linq.csproj',
            csproj: `<Project Sdk="Microsoft.NET.Sdk">
                        <PropertyGroup></PropertyGroup>
                        <PropertyGroup></PropertyGroup>
                        <PropertyGroup>
                            <RootNamespace>System.Linq</RootNamespace>
                        </PropertyGroup>
                    </Project>`, 
            expected: 'System.Linq',
        },
        {
            filename: 'empty-group.csproj',
            csproj: `
            <Project Sdk="Microsoft.NET.Sdk">
                <PropertyGroup>
                </PropertyGroup>
            </Project>`, 
            expected: undefined,
        },
        {
            filename: 'only-project-node.csproj',
            csproj: '<Project Sdk="Microsoft.NET.Sdk"></Project>', 
            expected: undefined,
        },
    ];

    const targetFrameworkFixtures: Array<Fixture> = [
        {
            filename: 'first-node.csproj',
            csproj: `
            <Project Sdk="Microsoft.NET.Sdk">
                <PropertyGroup>
                    <TargetFramework>%PLACE_HOLDER%</TargetFramework>
                </PropertyGroup>
            </Project>
            `, 
            expected: '%PLACE_HOLDER%',
        },
        {
            filename: 'last-node.csproj',
            csproj: `<Project Sdk="Microsoft.NET.Sdk">
                        <PropertyGroup></PropertyGroup>
                        <PropertyGroup></PropertyGroup>
                        <PropertyGroup>
                            <TargetFramework>%PLACE_HOLDER%</TargetFramework>
                        </PropertyGroup>
                    </Project>`, 
            expected: '%PLACE_HOLDER%',
        },
        {
            filename: 'empty-group.csproj',
            csproj: `
            <Project Sdk="Microsoft.NET.Sdk">
                <PropertyGroup></PropertyGroup>
            </Project>
            `, 
            expected: undefined,
        },
        {
            filename: 'only-project-node.csproj',
            csproj: '<Project Sdk="Microsoft.NET.Sdk"></Project>', 
            expected: undefined,
        },
    ];
    
    const invalidCsProjFixtures : Array<Fixture> = [
        {
            filename: 'empty.csproj',
            csproj: '', 
            expected: undefined,
        },
        {
            filename: 'random-text.csproj',
            csproj: 'lorem ipsum',
            expected: undefined,
        },
        {
            filename: 'malformed-xml-1.csproj',
            csproj: '<',
            expected: undefined,
        },
        {
            filename: 'malformed-xml-2.csproj',
            csproj: '<>',
            expected: undefined,
        },
        {
            filename: 'malformed-xml-3.csproj',
            csproj: '/>',
            expected: undefined,
        },
        {
            filename: 'malformed-xml-missing-end-tag.csproj',
            csproj: '<lorem>',
            expected: undefined,
        },
        {
            filename: 'malformed-xml-missing-start-tag.csproj',
            csproj: '</lorem>',
            expected: undefined,
        },
    ];
    invalidCsProjFixtures.forEach(({ filename, csproj, expected }) => {
        test(`getRootNamespace from ${filename} with invalid content ${csproj} should return expected result ${expected}`, async () => {
            const filePath = `${fixture_path}/${filename}`;
            fs.writeFileSync(filePath, csproj);
            const detector = new CsprojReader(filePath);
            const actual = await detector.getRootNamespace();

            fs.unlinkSync(filePath);
            assert.strictEqual(actual, expected);
        });
        test(`getTargetFramework from ${filename} with invalid content ${csproj} should return expected result ${expected}`, async () => {
            const filePath = `${fixture_path}/${filename}`;
            fs.writeFileSync(filePath, csproj);
            const detector = new CsprojReader(filePath);
            const actual = await detector.getTargetFramework();
    
            fs.unlinkSync(filePath);
            assert.strictEqual(actual, expected);
        });
    });

    rootNameSpacefixtures.forEach(({ filename, csproj, expected }) => {
        test(`getNamespace from ${filename} with content ${csproj} should return expected result ${expected}`, async () => {
            const filePath = `${fixture_path}/${filename}`;
            fs.writeFileSync(filePath, csproj);
            const detector = new CsprojReader(filePath);
            const actual = await detector.getRootNamespace();

            fs.unlinkSync(filePath);
            assert.strictEqual(actual, expected);
        });
    });

    targetFrameworkFixtures.forEach(({ filename, csproj, expected }) => {
        validTargetFramework.forEach((targetFramework, index) =>{
            test(`getTargetFramework from ${filename} with content ${csproj} should return expected result ${expected}`, async () => {
                const filePath = `${fixture_path}/${index}-${filename}`;
                fs.writeFileSync(filePath, csproj.replace('%PLACE_HOLDER%', targetFramework));
                const detector = new CsprojReader(filePath);
                const actual = await detector.getTargetFramework();
    
                fs.unlinkSync(filePath);
                assert.strictEqual(actual, expected?.replace('%PLACE_HOLDER%', targetFramework));
            });
        });
    });

    test('getFilePath return expected result',() => {
        const filePath = `${fixture_path}/my-fancy-csproj-file`;
        const detector = new CsprojReader(filePath);
        const actual = detector.getFilePath();

        assert.strictEqual(actual, filePath);
    });
});
