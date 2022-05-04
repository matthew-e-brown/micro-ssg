import { HelperOptions } from 'handlebars';

export default function(this: any, options: HelperOptions) {
    return `!! ${options.fn(this)} !!`;
}
