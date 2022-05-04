import { HelperOptions } from 'handlebars';

// Must annotate `this` as `any` because Handlebars
export default function(this: any, options: HelperOptions) {
    return `!! ${options.fn(this)} !!`;
}
