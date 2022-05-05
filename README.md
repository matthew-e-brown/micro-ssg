# Micro SSG

A microscopic, static-site generating "framework" that wraps Handlebars.


## Usage

Create a directory structure that looks like

```
src
├─ pages
│  ├─ anything.{handlebars,hbs}
│  └─ anything-else.{handlebars,hbs}
├─ data
│  ├─ anything.{json,yaml,yml}
│  └─ anything-else.{json,yaml,yml}
├─ partials
│  └─ whatever.{handlebars,hbs}
└─ helpers
   └─ doStuff.{js,ts}
```

and you're good to go. Every Handlebars file inside the `pages` directory gets
its own `.html` file output, feeding the files of the same name from the `data`
directory to Handlebars to generate them. Partials are automatically registered
with Handlebars while before rendering by scanning the `partials` folder for
them by name (i.e. referencing `{{> subsection }}` will look for
`partials/subsection.hbs`).


### Data

Data files may be either in YAML (`.yml`, `.yaml`), JSON (`.json`), or Markdown
(`.md`. `.markdown`) format. YAML and JSON are passed directly to the Handlebars
compiler as input objects; Markdown is rendered to HTML and passed on the input
object as `_md`.

If you create a data file with the name `_shared`, it will be parsed exactly as
all the other data files, with its contents being made available underneath the
nested `_shared` object.


### Helpers

The `helpers` directory lets you write `.js` files to be used as helpers. They
should contain a function as their default export, and return strings; they are
written exactly as they are in [Handlebars' guide][hbs-guide]:

```js
// ----------------------------
// Handlebars examples:
// ----------------------------

// https://handlebarsjs.com/guide/#custom-helpers
Handlebars.registerHelper('loud', function (aString) {
    return aString.toUpperCase();
})

// https://handlebarsjs.com/guide/#block-helpers
Handlebars.registerHelper('list', function (items, options) {
    const itemsAsHtml = items.map(item => `<li>${options.fn(item)}</li>`);
    return `<ul>${itemsAsHtml.join('\n')}</ul>`;
});

// ----------------------------
// Adapted for micro-ssg:
// ----------------------------

// In a file called 'helpers/loud.js':
export default function(aString) {
    return aString.toUpperCase();
}

// In a file called 'helpers/list.js':
export default function(items, options) {
    const itemsAsHtml = items.map(item => `<li>${options.fn(item)}</li>`);
    return `<ul>${itemsAsHtml.join('\n')}</ul>`;
}
```


#### TypeScript Helpers

You can also enable support for `.ts` helper files by passing a path to a
`tsconfig.json` file to the compiler, and making sure you have `ts-node`
installed in your `node_modules`.

You can achieve *slightly* better typing by importing `HelperOptions`, which is
re-exported from `handlebars`. If you are using `strict: true` in your tsconfig,
you may also need to give `this` a type, since Handlebars uses it for accessing
the current context (the set of variables / the data in the namespace at the
time):

```ts
// italicize.ts:
import { HelperOptions } from 'micro-ssg';

export default function(this: any, options: HelperOptions) {
    return `<em>${options.fn(this)}</em>`;
}
```


## "Motivation"

I'm writing this for use with my resume and my personal site, since neither one
needs to be more complication that static HTML, but it would be nice to use
partials and template them off a data-file. This package is based off of a janky
[compiler script][resume-script] that I am/was using for my resume.


[resume-script]: https://github.com/matthew-e-brown/resume/blob/8ba7903a0178b799c3b4b1e60a68052eca82f3d1/compile.ts
[hbs-guide]: https://handlebarsjs.com/guide/
