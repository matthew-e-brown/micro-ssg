/* eslint-disable @typescript-eslint/explicit-function-return-type */

import path from 'path';
import { tmpdir } from 'os';
import { readFile, mkdtemp, rm } from 'fs/promises';

import { compile } from '../src/lib/compiler';


let tempDir: string;

beforeAll(async () => tempDir = await mkdtemp(path.join(tmpdir(), 'test-')));
afterAll(async () => await rm(tempDir, { recursive: true, force: true }));


describe('Contrived, full test', () => {

    const readToString = (path: string) => readFile(path).then(buff => buff.toString());

    test('compile without crashing', async () => {
        await compile(path.join(__dirname, 'contrived'), {
            dist: tempDir,
            overwrite: true,
        });
    });

    test('compare output with expected', async () => {
        const indexContents = await readToString(path.join(tempDir, 'index.html'));
        const secondContents = await readToString(path.join(tempDir, 'second.html'));

        console.log(indexContents.split(/\r?\n/g));
        console.log(secondContents.split(/\r?\n/g));

        expect(indexContents.split(/\r?\n/g))
            .toStrictEqual([
                'Page: index',
                '',
                'Inserting partial:',
                'head partial, pageTitle value = Index Page',
                '',
                'Inserting data:',
                'key = value',
                'hello = world',
                '',
                'Prepending hyphens:',
                '-- world',
                '',
                'Surrounding with exclamation points:',
                '!! why are we yelling !!',
                ''
            ]);

        expect(secondContents.split(/\r?\n/g))
            .toStrictEqual([
                'Page: second',
                '',
                'Inserting partial:',
                'head partial, pageTitle value = Second Page',
                '',
                'Inserting data:',
                'title = Fish!',
                ''
            ]);
    });

});
