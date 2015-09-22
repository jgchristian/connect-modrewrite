
/**
 * Module dependencies
 */

var url = require('url');
var qs = require('qs');
var httpReq = require('http').request;
var httpsReq = require('https').request;
var defaultVia = '1.1 ' + require('os').hostname();

/**
 * Syntaxes
 */

var noCaseSyntax = /NC/;
var lastSyntax = /L/;
var proxySyntax = /P/;
var redirectSyntax = /R=?(\d+)?/;
var forbiddenSyntax = /F/;
var goneSyntax = /G/;
var typeSyntax = /T=([\w|\/]+,?)/;
var hostSyntax =  /H=([^,]+)/;
var flagSyntax = /\[([^\]]+)]$/;
var partsSyntax = /\s+|\t+/g;
var httpsSyntax = /^https/;
var querySyntax = /\?(.*)/;
var queryStringAppendSyntax = /QSA/;

/**
 * Export `API`
 */

module.exports = function(rules) {
  // Parse the rules to get flags, replace and match pattern
  rules = _parse(rules);

  return function(req, res, next) {
    var protocol = req.connection.encrypted || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    var callNext = true;

    rules.some(function(rule) {

      if(rule.host) {
        if(!rule.host.test(req.headers.host)) {
          return false;
        }
      }
      
      var path = url.parse(req.url).pathname;

      var match = rule.regexp.test(path);

      // If not match
      if(!match) {
        // Inverted rewrite
        if(rule.inverted) {
          req.url = rule.replace;
          return rule.last;
        }

        return false;
      }

      // Type
      if(rule.type) {
        res.setHeader('Content-Type', rule.type);
      }

      // Gone
      if(rule.gone) {
        res.writeHead(410);
        res.end();
        callNext = false;
        return true;
      }

      // Forbidden
      if(rule.forbidden) {
        res.writeHead(403);
        res.end();
        callNext = false;
        return true;
      }

      // Proxy
      if(rule.proxy) {
        _proxy(rule, {
          protocol : protocol,
          req : req,
          res : res,
          next : next
        });
        callNext = false;
        return true;
      }

      // Redirect
      if(rule.redirect) {
        var location;
        var locationProtocolAndHost;
        if(/\:\/\//.test(rule.replace)) {
          // Replacement rule contains protocol so assume absolute URL.  
          locationProtocolAndHost = protocol + "://" + url.parse(rule.replace).host;
        } else {
          // Else it's a relative replacement URL.  
          // By default, for maximum compatibility we want to set Location: to an absolute URL, so take the host from the original request
          // If the "x-use-relative-redirects" request header is set, then just return the path
          if (req.headers['x-use-relative-redirects']) {
            locationProtocolAndHost = "";  
          } else {
            locationProtocolAndHost = protocol + "://" + req.headers.host;  
          }
        }
        // As we only matched on the path, we'll only use the path as the input string when applying the regex
        location = locationProtocolAndHost + url.parse(req.url).pathname.replace(rule.regexp, url.parse(rule.replace).path) + _appendOriginalQueryStringIfApplicable(req.url, rule);

        res.writeHead(rule.redirect, {
          Location : location
        });
        res.end();
        callNext = false;
        return true;
      }

      // Rewrite
      if(!rule.inverted) {
        if (rule.replace !== '-') {
          req.url = path.replace(rule.regexp, rule.replace) + _appendOriginalQueryStringIfApplicable(req.url, rule);
        }
        return rule.last;
      }
    });

    // Add to query object
    var queryValue = querySyntax.exec(req.url);
    if(queryValue) {
      req.params = req.query = qs.parse(queryValue[1]);
    }

    if(callNext) {
      next();
    }

  };
};

/**
 * Get flags from rule rules
 *
 * @param {Array.<rules>} rules
 * @return {Object}
 * @api private
 */

function _parse(rules) {
  return (rules || []).map(function(rule) {
    // Reset all regular expression indexes
    lastSyntax.lastIndex = 0;
    proxySyntax.lastIndex = 0;
    redirectSyntax.lastIndex = 0;
    forbiddenSyntax.lastIndex = 0;
    goneSyntax.lastIndex = 0;
    typeSyntax.lastIndex = 0;
    hostSyntax.lastIndex = 0;

    var parts = rule.replace(partsSyntax, ' ').split(' '), flags = '';

    if(flagSyntax.test(rule)) {
      flags = flagSyntax.exec(rule)[1];
    }

    // Check inverted urls
    var inverted = parts[0].substr(0, 1) === '!';
    if(inverted) {
      parts[0] = parts[0].substr(1);
    }

    var redirectValue = redirectSyntax.exec(flags);
    var typeValue = typeSyntax.exec(flags);
    var hostValue = hostSyntax.exec(flags);

    return {
      regexp: typeof parts[2] !== 'undefined' && noCaseSyntax.test(flags) ? new RegExp(parts[0], 'i') : new RegExp(parts[0]),
      replace: parts[1],
      inverted: inverted,
      last: lastSyntax.test(flags),
      proxy: proxySyntax.test(flags),
      redirect: redirectValue ? (typeof redirectValue[1] !== 'undefined' ? redirectValue[1] : 301) : false,
      forbidden: forbiddenSyntax.test(flags),
      gone: goneSyntax.test(flags),
      type: typeValue ? (typeof typeValue[1] !== 'undefined' ? typeValue[1] : 'text/plain') : false,
      host: hostValue ? new RegExp(hostValue[1]) : false,
      queryStringAppend: queryStringAppendSyntax.test(flags)
    };
  });
}

/**
 * Proxy the request
 *
 * @param {Object} rule
 * @param {Object} metas
 * @return {void}
 * @api private
 */

function _proxy(rule, metas) {
  var opts = _getRequestOpts(metas.req, rule);
  var request = httpsSyntax.test(rule.replace) ? httpsReq : httpReq;

  var pipe = request(opts, function (res) {
    res.headers.via = opts.headers.via;
    metas.res.writeHead(res.statusCode, res.headers);
    res.on('error', function (err) {
      metas.next(err);
    });
    res.pipe(metas.res);
  });

  pipe.on('error', function (err) {
    metas.next(err);
  });

  if(!metas.req.readable) {
    pipe.end();
  } else {
    metas.req.pipe(pipe);
  }
}

/**
 * Get request options
 *
 * @param {HTTPRequest} req
 * @param {Object} rule
 * @return {Object}
 * @api private
 */

function _getRequestOpts(req, rule) {
  var opts = url.parse(req.url.replace(rule.regexp, rule.replace), true);
  var query = (opts.search != null) ? opts.search : '';

  if(query) {
    opts.path = opts.pathname + query;
  }
  opts.method  = req.method;
  opts.headers = req.headers;
  var via = defaultVia;
  if(req.headers.via) {
    via = req.headers.via + ', ' + via;
  }
  opts.headers.via = via;

  delete opts.headers['host'];

  return opts;
}

/**
  * From: http://httpd.apache.org/docs/2.2/mod/mod_rewrite.html
  * Modifying the Query String
  * 
  * By default, the query string is passed through unchanged. You can, however, create URLs in the substitution string containing a query string part. Simply use a question mark inside the substitution string to indicate that the following text should be re-injected into the query string. When you want to erase an existing query string, end the substitution string with just a question mark. To combine new and old query strings, use the [QSA] flag.
  *       
  * From: http://httpd.apache.org/docs/2.2/rewrite/flags.html#flag_qsa
  *  
  * When the replacement URI contains a query string, the default behavior of RewriteRule is to discard the existing query string, and replace it with the newly generated one. Using the [QSA] flag causes the query strings to be combined.
  * Consider the following rule:
  *
  * RewriteRule /pages/(.+) /page.php?page=$1 [QSA]
  * With the [QSA] flag, a request for /pages/123?one=two will be mapped to /page.php?page=123&one=two. Without the [QSA] flag, that same request will be mapped to /page.php?page=123 - that is, the existing query string will be discarded.
  */
function _appendOriginalQueryStringIfApplicable(originalRequestURL, rule) {

  var reqQueryValue = querySyntax.exec(originalRequestURL);

  if (!reqQueryValue || !reqQueryValue[1]) {
    return "";
  }

  var result;
  if (querySyntax.test(rule.replace)) {
      // Substitution string contains a query string.  
      // mod_rewrite behaviour is to drop the existing query string unless QSA flag is specified
      if (rule.queryStringAppend) {
         // Append the original request query string
        result = "&" + reqQueryValue[1];

      } else {
        // Take the substition string
        result = "";
      }
  } else {
      // Substitution string does not contain a query string
      // Pass the query string through
      result = "?" + reqQueryValue[1];
  }

  return result;
}