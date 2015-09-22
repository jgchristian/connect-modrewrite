Fork Description
================
Fork of [connect-modrewrite](https://github.com/tinganho/connect-modrewrite) to bring query string support inline with the httpd implementation

Changes in this fork
- (Breaking Change) Rewrite rules are only matched on the requested URL path
  - Importantly, query strings are *excluded* when matching
- (Breaking Change) Query strings are handled as follows:
  - If the substitution string does not contains a query string, the query string from the original request URL is appended to the rewritten URL
  - If the substitution string does contains a query string,
    - If the QSA (Query String Append) flag is set, the query string from the original request URL is appended to substitution string's query string when rewriting the  URL
    - Else, the query string from the original request URL is dropped and only substitution string's query string is included when rewriting the URL
- New feature for dev testing to support relative redirects; 
  - if...
    - processing a redirect rule, and 
    - the redirect target URL does not contain a protocol+host, and 
    - the request has the header "x-use-relative-redirects" 
  - ...then we exclude the protocol and host when constructing the Location redirect value

connect-modrewrite [![Build Status](https://travis-ci.org/tinganho/connect-modrewrite.png)](https://travis-ci.org/tinganho/connect-modrewrite)
========================

[![NPM](https://nodei.co/npm/connect-modrewrite.png?downloads=true&stars=true)](https://nodei.co/npm/connect-modrewrite/)

`connect-modrewrite` adds modrewrite functionality to connect/express server.

# Getting started
Install `connect-modrewrite` with:
```bash
npm install connect-modrewrite --save
```

Require it:

```javascript
var modRewrite = require('connect-modrewrite');
```
An example configuration:

```javascript
var app = connect() // express() for express 3.x  server
// app.configure(function() { for express 3.x server
  .use(modRewrite([
    '^/test$ /index.html',
    '^/test/\\d*$ /index.html [L]',
    '^/test/\\d*/\\d*$ /flag.html [L]'
  ]))
  .use(connect.static(options.base))
  .listen(3000)
// }) for express 3.x server
```

# Configurations
In the example above, `modRewrite` take as an `Array` of rewrite rules as an argument.
Each rewrite rule is a string with the syntax:
`MATCHING_PATHS REPLACE_WITH [FLAGS]`.
`MATCHING_PATHS` should be defined using a regex string. And that string is passed as an argument to the javascript `RegExp Object` for matching of paths. `REPLACE_WITH` is the replacement string for matching paths. Flags is optional and is defined using hard brackets.

## Inverted URL matching
Begin with `!` for inverted URL matching.

## Use defined params
Just wrap the defined param with `()` and access it with `$n`. This is defined in JS `.replace` in https://developer.mozilla.org/en/docs/JavaScript/Reference/Global_Objects/String/replace.

`^/blog/(.*) /$1`

## Dash
A dash indicates that no substitution should be performed.

`^/blog/(.*) - [L]`

## Flags
### Last [L]
If a path matches, any subsequent rewrite rules will be disregarded.

### Proxy [P]
Proxy your requests
```javasript
'^/test/proxy/(.*)$ http://nodejs.org/$1 [P]'
```

### Redirect [R], \[R=3**\] (replace * with numbers)
Issue a redirect for request.

### Nocase [NC]
Regex match will be case-insensitive.

### Forbidden [F]
Gives a HTTP 403 forbidden response.

### Gone [G]
Gives a HTTP 410 gone response.

### Type \[T=*\] (replace * with mime-type)
Sets content-type to the specified one.

### Host [H], \[H=*\] (replace * with a regular expression that match a hostname)
Match on host.

### Query String Append [QSA]
Appends any query string from the original request URL to any query string created in the rewrite target.

For more info about available flags, please go to the Apache page:
http://httpd.apache.org/docs/current/rewrite/flags.html

## Authors
Tingan Ho, [@tingan87][]

## License
Licensed under the MIT license.

## Other recommended projects
### L10ns
[L10ns][] is an internationalization workflow and formatting tool. It handles complex localization problems like pluralization, genus based formatting etc. It also provides a workflow similar to XGettext.

[@tingan87]: https://twitter.com/tingan87
[L10ns]: http://l10ns.org
