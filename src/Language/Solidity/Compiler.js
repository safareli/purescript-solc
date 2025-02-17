"use strict";

const solcMod = require('solc');

function stringify(input) {
  if (typeof input !== 'string') {
    return JSON.stringify(input);
  }
  return input;
}

function objectify(input) {
  if (typeof input === 'object') {
    return input;
  }
  return JSON.parse(input);
}

exports.defaultCompiler = solcMod;

exports.version = function(solc) {
  return solc.version();
}

exports.useCompiler = function(source) {
  const requireFromString = function(str) {
    const filename = "__solc_useCompiler";
    const Module = module.constructor;
    var m = new Module(filename, module);
    m.filename = filename
    m.paths = module.paths;
    m._compile(source, "__solc_useCompiler");
    return m.exports;
  }
  return solcMod.setupMethods(requireFromString(source));
}

exports.callbackSuccess = function (contents) {
  return { "contents": contents }
};

exports.callbackFailure = function (error) {
  return { "error": error }
};

exports._loadRemoteVersion = function(version) {
  return function (onError, onSuccess) {
    var cancel = solcMod.loadRemoteVersion(version, function(err, solcSnapshot) {
      if (err) {
        onError(err);
      } else {
        onSuccess(solcSnapshot);
      }
    });
    return function(cancelError, onCancelerError, onCancelerSuccess) {
      cancel();
      onCancelerSuccess();
    };
  }
};

exports._compile = function (solc, input, readCallback) {
  return function() {
    // support different versions of solc-js
    // to understand what's going on here, keep this in mind:
    //
    // for the __NPM PACKAGE__ "solc"
    // 0.5.x and up compile() expects stringified standard compiler JSON
    //   --> 0.5.0 - 0.5.2 keep compileStandardWrapper for backwards compatibility.
    // 0.4.11 - 0.4.26 have compileStandardWrapper which behaves like 0.5.x compile()
    // 0.4.10 and below can die in a conflagration
    //   --> compile takes three arguments, (input, optimize, callback)
    //     --> where input may or may not be stringified standard compiler JSON
    //     --> not even sure what happens when you pass false for optimize (does the JSON input override the bool?)
    //   --> so we just don't support it...
    //
    // so... if compileStandardWrapper exists we use that, cause it's the most reliable between 0.4.11 -> 0.5.x of the NPM package
    // otherwise we assume that whatever solc.version() (version of compiler, not npm package!) returns is also the version of the
    // solc npm package we're using (let's be honest, is anyone really gonna be using < 0.5?).
    // Nonetheless, before using compile(), we check that it'll behave like 0.5.x+'s., by making sure that the compiler version
    // is not overlapping with an unsupported solc NPM version.
    const compile = function(i, cb) {
      if (solc.compileStandardWrapper) {
        return solc.compileStandardWrapper(i, cb);
      } else {
        const fallbackVersion = '<unknown/unsupported>';
        var version = solc.version;
        if (typeof version === 'function') {
          version = solc.version();
        } else if (typeof version !== 'string') {
          version = fallbackVersion;
        }

        // solc-js packages that were released with a version number < 0.4.11 that could've also been a compiler version are
        // --> 0.3.2 -> 0.3.6
        // --> 0.4.1
        // --> 0.4.10
        // and we have to support "-nightly.date+commit.commit" and just "+commit.commit"
        const isFallbackVersion = version === fallbackVersion;
        const isUnsupportedV3_x = version.startsWith("0.3");
        const isUnsupportedV4_x = version.startsWith("0.4.1+") || version.startsWith("0.4.1-") || version.startsWith("0.4.10+") || version.startsWith("0.4.10-");
        if (isFallbackVersion || isUnsupportedV3_x|| isUnsupportedV4_x) {
          throw new Error("Solidity version is " + version + ", which is unsupported by purescript-solc.");
        } else {
          // if we got here we're probably using version 0.5.x or above AND they actually went through on their promise to remove the deprecated
          // compileStandardWrapper (they said they'd get rid of it after 0.5.3, but 0.5.11 (latest as of this writing) still has it).
          // odds are we can just call solc.compile()!
          return solc.compile(i, cb);
        }
      }
    };
    return objectify(compile(stringify(input), function(requestedFile) {
      return readCallback(requestedFile)();
    }));
  }
};
