import path from 'path';

import { compile } from '../src/lib/compiler';

test('Test', async () => {
    console.log('Running test');
    // Just run the function for now to see output
    await compile(path.join(__dirname, 'example'), {
        dist: './test-output',
        overwrite: true,
    });
});
