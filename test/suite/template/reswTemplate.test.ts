import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

import ReswTemplate from '../../../src/template/reswTemplate';

const fixture_path= path.resolve(__dirname, '../../suite/');
const templates_path = path.resolve(__dirname, '../../../../templates/');

suite('ReswTemplate', () => {
    test('create resw template when wrong template path, throws exception', () => {
        const reswTemplate = new ReswTemplate('test', 'createUwpResourceFile',);

        return reswTemplate.create('notExsistingTemplate', 'testfilePath', 'test')
            .catch((err) => {
                const unexpectedPath = `notExsistingTemplate${path.sep}test.tmpl`;
                assert.strictEqual(err.message, `Could not read template file from '${unexpectedPath}'`);
            });
    });

    test('create resw file', () => {
        const reswTemplate = new ReswTemplate('UWP_Resource', 'createUwpResourceFile');
        const filename = 'ReswFile';
        const pathWithoutExtension = `${fixture_path}${path.sep}${filename}`;

        return reswTemplate.create(templates_path, pathWithoutExtension, filename)
            .then(() => {
                assert.strictEqual(fs.existsSync(`${pathWithoutExtension}.resw`), true);
                const contentResw = fs.readFileSync(`${pathWithoutExtension}.resw`).toString();
                const templateContent = fs.readFileSync(`${templates_path}${path.sep}uwp_resource.tmpl`)
                    .toString()
                    .replace('${cursor}', '');
                assert.strictEqual(contentResw, templateContent);
                fs.unlinkSync(`${pathWithoutExtension}.resw`);
            });
    });
});
