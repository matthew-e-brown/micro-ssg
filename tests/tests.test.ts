import path from 'path';

import { compile } from '../src/lib/compiler';

test('Test', async () => {
    // Just run the function for now to see output
    await compile(path.join(__dirname, 'example'));
});
