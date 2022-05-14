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

Any `.js`<sup>[[*]](#typescript-helpers)</sup> files in the `helpers` directory
are automatically imported and registered with Handlebars; however, you can tell
Micro SSG to skip a specific helper by starting its name with an underscore. For
example, say you have a module in `helpers` that contains some common functions:

```
src
├─ pages
│  ├─ index.hbs
│  └─ about.hbs
└─ helpers
   ├─ _common-functions.js
   ├─ helper1.js
   ├─ helper2.js
   └─ helper3.js
```

The `_common-functions.js` module will not be imported.


#### Post-build Helper

If you place a file called `_post-build.js` or `_post-build.ts` inside the `src`
directory, its default export will be used to mutate the body of the rendered
HTML once Handlebars is finished rendering them. The function signature for the
file's default export should be as follows:

```ts
type PostBuildHelper = (
    pageName: string,
    pageHtml: string,
) => Promise<string> | PromiseLike<string> | string;
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
[compiler script][janky-script] that I used to use for my resume.


[hbs-guide]: https://handlebarsjs.com/guide/
[janky-script]: https://github.com/matthew-e-brown/resume/blob/ff5bfdd0400b2d2f4878ae86cbceecc19d8aa0a3/compile.ts
