/* eslint-disable @typescript-eslint/explicit-function-return-type */

import path from 'path';
import { tmpdir } from 'os';
import { readFile, mkdtemp, rm } from 'fs/promises';

import { compile } from '../src/lib/compiler';


let tempDir: string;
beforeAll(async () => tempDir = await mkdtemp(path.join(tmpdir(), 'test-')));
afterAll(async () => await rm(tempDir, { recursive: true, force: true }));


async function readFileToString(path: string) {
    const buffer = await readFile(path);
    return buffer.toString();
}


async function compare(name: string, expectedLines: string[]) {
    const pageContents = await readFileToString(path.join(tempDir, name));
    const pageLines = pageContents.split(/\r?\n/g);
    expect(pageLines).toStrictEqual(expectedLines);
}


describe('Compiler', () => {

    it('should compile the input without crashing', async () => {
        await compile(path.join(__dirname, 'contrived'), {
            dest: tempDir,
            overwrite: true,
            tsConfigPath: './tsconfig.json',
        });
    });

    it('should compile index.html to the expected output', () => {
        return compare('index.html', [
            'Page: index',
            '',
            'Inserting partial:',
            'head partial, pageTitle value = Index Page',
            '',
            'Inserting data:',
            'key = value',
            'hello = world',
            '_shared.yeet = yolo',
            '',
            'Prepending hyphens:',
            '-- world',
            '',
            'Surrounding with exclamation points:',
            '!! why are we yelling !!',
            '',
        ]);
    });

    it('should compile second.html to the expected output', () => {
        return compare('second.html', [
            'Page: second',
            '',
            'Inserting partial:',
            'head partial, pageTitle value = Second Page',
            '',
            'Inserting data:',
            'title = Fish!',
            '_shared.yeet = yolo',
            '',
        ]);
    });

    it('should compile third.html to the expected output', () => {
        return compare('third.html', [
            'Rendered markdown:',
            '<p>This should be rendered as HTML. Italics: <em>slanted!</em></p>',
            '',
        ]);
    });

});
