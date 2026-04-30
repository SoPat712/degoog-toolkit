var convertUnits = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) =>
    function __require() {
      return (
        mod ||
          (0, cb[__getOwnPropNames(cb)[0]])(
            (mod = { exports: {} }).exports,
            mod,
          ),
        mod.exports
      );
    };

  // node_modules/lodash._objecttypes/index.js
  var require_lodash = __commonJS({
    "node_modules/lodash._objecttypes/index.js"(exports, module) {
      var objectTypes = {
        boolean: false,
        function: true,
        object: true,
        number: false,
        string: false,
        undefined: false,
      };
      module.exports = objectTypes;
    },
  });

  // node_modules/lodash.isobject/index.js
  var require_lodash2 = __commonJS({
    "node_modules/lodash.isobject/index.js"(exports, module) {
      var objectTypes = require_lodash();
      function isObject(value) {
        return !!(value && objectTypes[typeof value]);
      }
      module.exports = isObject;
    },
  });

  // node_modules/lodash._renative/index.js
  var require_lodash3 = __commonJS({
    "node_modules/lodash._renative/index.js"(exports, module) {
      var objectProto = Object.prototype;
      var toString = objectProto.toString;
      var reNative = RegExp(
        "^" +
          String(toString)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            .replace(/toString| for [^\]]+/g, ".*?") +
          "$",
      );
      module.exports = reNative;
    },
  });

  // node_modules/lodash._shimkeys/index.js
  var require_lodash4 = __commonJS({
    "node_modules/lodash._shimkeys/index.js"(exports, module) {
      var objectTypes = require_lodash();
      var objectProto = Object.prototype;
      var hasOwnProperty = objectProto.hasOwnProperty;
      var shimKeys = function (object) {
        var index,
          iterable = object,
          result = [];
        if (!iterable) return result;
        if (!objectTypes[typeof object]) return result;
        for (index in iterable) {
          if (hasOwnProperty.call(iterable, index)) {
            result.push(index);
          }
        }
        return result;
      };
      module.exports = shimKeys;
    },
  });

  // node_modules/lodash.keys/index.js
  var require_lodash5 = __commonJS({
    "node_modules/lodash.keys/index.js"(exports, module) {
      var isObject = require_lodash2();
      var reNative = require_lodash3();
      var shimKeys = require_lodash4();
      var nativeKeys = reNative.test((nativeKeys = Object.keys)) && nativeKeys;
      var keys = !nativeKeys
        ? shimKeys
        : function (object) {
            if (!isObject(object)) {
              return [];
            }
            return nativeKeys(object);
          };
      module.exports = keys;
    },
  });

  // node_modules/lodash.noop/index.js
  var require_lodash6 = __commonJS({
    "node_modules/lodash.noop/index.js"(exports, module) {
      function noop() {}
      module.exports = noop;
    },
  });

  // node_modules/lodash._basecreate/index.js
  var require_lodash7 = __commonJS({
    "node_modules/lodash._basecreate/index.js"(exports, module) {
      var isObject = require_lodash2();
      var noop = require_lodash6();
      var reNative = require_lodash3();
      var nativeCreate =
        reNative.test((nativeCreate = Object.create)) && nativeCreate;
      function baseCreate(prototype, properties) {
        return isObject(prototype) ? nativeCreate(prototype) : {};
      }
      if (!nativeCreate) {
        baseCreate = /* @__PURE__ */ (function () {
          function Object2() {}
          return function (prototype) {
            if (isObject(prototype)) {
              Object2.prototype = prototype;
              var result = new Object2();
              Object2.prototype = null;
            }
            return result || global.Object();
          };
        })();
      }
      module.exports = baseCreate;
    },
  });

  // node_modules/lodash._setbinddata/index.js
  var require_lodash8 = __commonJS({
    "node_modules/lodash._setbinddata/index.js"(exports, module) {
      var noop = require_lodash6();
      var reNative = require_lodash3();
      var descriptor = {
        configurable: false,
        enumerable: false,
        value: null,
        writable: false,
      };
      var defineProperty = (function () {
        try {
          var o = {},
            func = reNative.test((func = Object.defineProperty)) && func,
            result = func(o, o, o) && func;
        } catch (e) {}
        return result;
      })();
      var setBindData = !defineProperty
        ? noop
        : function (func, value) {
            descriptor.value = value;
            defineProperty(func, "__bindData__", descriptor);
          };
      module.exports = setBindData;
    },
  });

  // node_modules/lodash._basebind/index.js
  var require_lodash9 = __commonJS({
    "node_modules/lodash._basebind/index.js"(exports, module) {
      var baseCreate = require_lodash7();
      var isObject = require_lodash2();
      var setBindData = require_lodash8();
      var arrayRef = [];
      var push = arrayRef.push;
      function baseBind(bindData) {
        var func = bindData[0],
          partialArgs = bindData[2],
          thisArg = bindData[4];
        function bound() {
          if (partialArgs) {
            var args = partialArgs.slice();
            push.apply(args, arguments);
          }
          if (this instanceof bound) {
            var thisBinding = baseCreate(func.prototype),
              result = func.apply(thisBinding, args || arguments);
            return isObject(result) ? result : thisBinding;
          }
          return func.apply(thisArg, args || arguments);
        }
        setBindData(bound, bindData);
        return bound;
      }
      module.exports = baseBind;
    },
  });

  // node_modules/lodash._slice/index.js
  var require_lodash10 = __commonJS({
    "node_modules/lodash._slice/index.js"(exports, module) {
      function slice(array, start, end) {
        start || (start = 0);
        if (typeof end == "undefined") {
          end = array ? array.length : 0;
        }
        var index = -1,
          length = end - start || 0,
          result = Array(length < 0 ? 0 : length);
        while (++index < length) {
          result[index] = array[start + index];
        }
        return result;
      }
      module.exports = slice;
    },
  });

  // node_modules/lodash._basecreatewrapper/index.js
  var require_lodash11 = __commonJS({
    "node_modules/lodash._basecreatewrapper/index.js"(exports, module) {
      var baseCreate = require_lodash7();
      var isObject = require_lodash2();
      var setBindData = require_lodash8();
      var slice = require_lodash10();
      var arrayRef = [];
      var push = arrayRef.push;
      function baseCreateWrapper(bindData) {
        var func = bindData[0],
          bitmask = bindData[1],
          partialArgs = bindData[2],
          partialRightArgs = bindData[3],
          thisArg = bindData[4],
          arity = bindData[5];
        var isBind = bitmask & 1,
          isBindKey = bitmask & 2,
          isCurry = bitmask & 4,
          isCurryBound = bitmask & 8,
          key = func;
        function bound() {
          var thisBinding = isBind ? thisArg : this;
          if (partialArgs) {
            var args = partialArgs.slice();
            push.apply(args, arguments);
          }
          if (partialRightArgs || isCurry) {
            args || (args = slice(arguments));
            if (partialRightArgs) {
              push.apply(args, partialRightArgs);
            }
            if (isCurry && args.length < arity) {
              bitmask |= 16 & ~32;
              return baseCreateWrapper([
                func,
                isCurryBound ? bitmask : bitmask & ~3,
                args,
                null,
                thisArg,
                arity,
              ]);
            }
          }
          args || (args = arguments);
          if (isBindKey) {
            func = thisBinding[key];
          }
          if (this instanceof bound) {
            thisBinding = baseCreate(func.prototype);
            var result = func.apply(thisBinding, args);
            return isObject(result) ? result : thisBinding;
          }
          return func.apply(thisBinding, args);
        }
        setBindData(bound, bindData);
        return bound;
      }
      module.exports = baseCreateWrapper;
    },
  });

  // node_modules/lodash.isfunction/index.js
  var require_lodash12 = __commonJS({
    "node_modules/lodash.isfunction/index.js"(exports, module) {
      function isFunction(value) {
        return typeof value == "function";
      }
      module.exports = isFunction;
    },
  });

  // node_modules/lodash._createwrapper/index.js
  var require_lodash13 = __commonJS({
    "node_modules/lodash._createwrapper/index.js"(exports, module) {
      var baseBind = require_lodash9();
      var baseCreateWrapper = require_lodash11();
      var isFunction = require_lodash12();
      var arrayRef = [];
      var push = arrayRef.push;
      function createWrapper(
        func,
        bitmask,
        partialArgs,
        partialRightArgs,
        thisArg,
        arity,
      ) {
        var isBind = bitmask & 1,
          isBindKey = bitmask & 2,
          isCurry = bitmask & 4,
          isCurryBound = bitmask & 8,
          isPartial = bitmask & 16,
          isPartialRight = bitmask & 32;
        if (!isBindKey && !isFunction(func)) {
          throw new TypeError();
        }
        if (isPartial && !partialArgs.length) {
          bitmask &= ~16;
          isPartial = partialArgs = false;
        }
        if (isPartialRight && !partialRightArgs.length) {
          bitmask &= ~32;
          isPartialRight = partialRightArgs = false;
        }
        var bindData = func && func.__bindData__;
        if (bindData && bindData !== true) {
          bindData = bindData.slice();
          if (isBind && !(bindData[1] & 1)) {
            bindData[4] = thisArg;
          }
          if (!isBind && bindData[1] & 1) {
            bitmask |= 8;
          }
          if (isCurry && !(bindData[1] & 4)) {
            bindData[5] = arity;
          }
          if (isPartial) {
            push.apply(bindData[2] || (bindData[2] = []), partialArgs);
          }
          if (isPartialRight) {
            push.apply(bindData[3] || (bindData[3] = []), partialRightArgs);
          }
          bindData[1] |= bitmask;
          return createWrapper.apply(null, bindData);
        }
        var creater =
          bitmask == 1 || bitmask === 17 ? baseBind : baseCreateWrapper;
        return creater([
          func,
          bitmask,
          partialArgs,
          partialRightArgs,
          thisArg,
          arity,
        ]);
      }
      module.exports = createWrapper;
    },
  });

  // node_modules/lodash.bind/index.js
  var require_lodash14 = __commonJS({
    "node_modules/lodash.bind/index.js"(exports, module) {
      var createWrapper = require_lodash13();
      var reNative = require_lodash3();
      var slice = require_lodash10();
      function bind(func, thisArg) {
        return arguments.length > 2
          ? createWrapper(func, 17, slice(arguments, 2), null, thisArg)
          : createWrapper(func, 1, null, null, thisArg);
      }
      module.exports = bind;
    },
  });

  // node_modules/lodash.identity/index.js
  var require_lodash15 = __commonJS({
    "node_modules/lodash.identity/index.js"(exports, module) {
      function identity(value) {
        return value;
      }
      module.exports = identity;
    },
  });

  // node_modules/lodash.support/index.js
  var require_lodash16 = __commonJS({
    "node_modules/lodash.support/index.js"(exports, module) {
      var reNative = require_lodash3();
      var reThis = /\bthis\b/;
      var support = {};
      support.funcDecomp =
        !reNative.test(global.WinRTError) &&
        reThis.test(function () {
          return this;
        });
      support.funcNames = typeof Function.name == "string";
      module.exports = support;
    },
  });

  // node_modules/lodash._basecreatecallback/index.js
  var require_lodash17 = __commonJS({
    "node_modules/lodash._basecreatecallback/index.js"(exports, module) {
      var bind = require_lodash14();
      var identity = require_lodash15();
      var setBindData = require_lodash8();
      var support = require_lodash16();
      var reFuncName = /^\s*function[ \n\r\t]+\w/;
      var reThis = /\bthis\b/;
      var fnToString = Function.prototype.toString;
      function baseCreateCallback(func, thisArg, argCount) {
        if (typeof func != "function") {
          return identity;
        }
        if (typeof thisArg == "undefined" || !("prototype" in func)) {
          return func;
        }
        var bindData = func.__bindData__;
        if (typeof bindData == "undefined") {
          if (support.funcNames) {
            bindData = !func.name;
          }
          bindData = bindData || !support.funcDecomp;
          if (!bindData) {
            var source = fnToString.call(func);
            if (!support.funcNames) {
              bindData = !reFuncName.test(source);
            }
            if (!bindData) {
              bindData = reThis.test(source);
              setBindData(func, bindData);
            }
          }
        }
        if (bindData === false || (bindData !== true && bindData[1] & 1)) {
          return func;
        }
        switch (argCount) {
          case 1:
            return function (value) {
              return func.call(thisArg, value);
            };
          case 2:
            return function (a, b) {
              return func.call(thisArg, a, b);
            };
          case 3:
            return function (value, index, collection) {
              return func.call(thisArg, value, index, collection);
            };
          case 4:
            return function (accumulator, value, index, collection) {
              return func.call(thisArg, accumulator, value, index, collection);
            };
        }
        return bind(func, thisArg);
      }
      module.exports = baseCreateCallback;
    },
  });

  // node_modules/lodash.forown/index.js
  var require_lodash18 = __commonJS({
    "node_modules/lodash.forown/index.js"(exports, module) {
      var baseCreateCallback = require_lodash17();
      var keys = require_lodash5();
      var objectTypes = require_lodash();
      var forOwn = function (collection, callback, thisArg) {
        var index,
          iterable = collection,
          result = iterable;
        if (!iterable) return result;
        if (!objectTypes[typeof iterable]) return result;
        callback =
          callback && typeof thisArg == "undefined"
            ? callback
            : baseCreateCallback(callback, thisArg, 3);
        var ownIndex = -1,
          ownProps = objectTypes[typeof iterable] && keys(iterable),
          length = ownProps ? ownProps.length : 0;
        while (++ownIndex < length) {
          index = ownProps[ownIndex];
          if (callback(iterable[index], index, collection) === false)
            return result;
        }
        return result;
      };
      module.exports = forOwn;
    },
  });

  // node_modules/lodash.foreach/index.js
  var require_lodash19 = __commonJS({
    "node_modules/lodash.foreach/index.js"(exports, module) {
      var baseCreateCallback = require_lodash17();
      var forOwn = require_lodash18();
      function forEach(collection, callback, thisArg) {
        var index = -1,
          length = collection ? collection.length : 0;
        callback =
          callback && typeof thisArg == "undefined"
            ? callback
            : baseCreateCallback(callback, thisArg, 3);
        if (typeof length == "number") {
          while (++index < length) {
            if (callback(collection[index], index, collection) === false) {
              break;
            }
          }
        } else {
          forOwn(collection, callback);
        }
        return collection;
      }
      module.exports = forEach;
    },
  });

  // node_modules/convert-units/lib/definitions/length.js
  var require_length = __commonJS({
    "node_modules/convert-units/lib/definitions/length.js"(exports, module) {
      var metric;
      var imperial;
      metric = {
        mm: {
          name: {
            singular: "Millimeter",
            plural: "Millimeters",
          },
          to_anchor: 1 / 1e3,
        },
        cm: {
          name: {
            singular: "Centimeter",
            plural: "Centimeters",
          },
          to_anchor: 1 / 100,
        },
        m: {
          name: {
            singular: "Meter",
            plural: "Meters",
          },
          to_anchor: 1,
        },
        km: {
          name: {
            singular: "Kilometer",
            plural: "Kilometers",
          },
          to_anchor: 1e3,
        },
      };
      imperial = {
        in: {
          name: {
            singular: "Inch",
            plural: "Inches",
          },
          to_anchor: 1 / 12,
        },
        yd: {
          name: {
            singular: "Yard",
            plural: "Yards",
          },
          to_anchor: 3,
        },
        "ft-us": {
          name: {
            singular: "US Survey Foot",
            plural: "US Survey Feet",
          },
          to_anchor: 1.000002,
        },
        ft: {
          name: {
            singular: "Foot",
            plural: "Feet",
          },
          to_anchor: 1,
        },
        mi: {
          name: {
            singular: "Mile",
            plural: "Miles",
          },
          to_anchor: 5280,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "m",
            ratio: 3.28084,
          },
          imperial: {
            unit: "ft",
            ratio: 1 / 3.28084,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/area.js
  var require_area = __commonJS({
    "node_modules/convert-units/lib/definitions/area.js"(exports, module) {
      var metric;
      var imperial;
      metric = {
        mm2: {
          name: {
            singular: "Square Millimeter",
            plural: "Square Millimeters",
          },
          to_anchor: 1 / 1e6,
        },
        cm2: {
          name: {
            singular: "Centimeter",
            plural: "Centimeters",
          },
          to_anchor: 1 / 1e4,
        },
        m2: {
          name: {
            singular: "Square Meter",
            plural: "Square Meters",
          },
          to_anchor: 1,
        },
        ha: {
          name: {
            singular: "Hectare",
            plural: "Hectares",
          },
          to_anchor: 1e4,
        },
        km2: {
          name: {
            singular: "Square Kilometer",
            plural: "Square Kilometers",
          },
          to_anchor: 1e6,
        },
      };
      imperial = {
        in2: {
          name: {
            singular: "Square Inch",
            plural: "Square Inches",
          },
          to_anchor: 1 / 144,
        },
        yd2: {
          name: {
            singular: "Square Yard",
            plural: "Square Yards",
          },
          to_anchor: 9,
        },
        ft2: {
          name: {
            singular: "Square Foot",
            plural: "Square Feet",
          },
          to_anchor: 1,
        },
        ac: {
          name: {
            singular: "Acre",
            plural: "Acres",
          },
          to_anchor: 43560,
        },
        mi2: {
          name: {
            singular: "Square Mile",
            plural: "Square Miles",
          },
          to_anchor: 27878400,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "m2",
            ratio: 10.7639,
          },
          imperial: {
            unit: "ft2",
            ratio: 1 / 10.7639,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/mass.js
  var require_mass = __commonJS({
    "node_modules/convert-units/lib/definitions/mass.js"(exports, module) {
      var metric;
      var imperial;
      metric = {
        mcg: {
          name: {
            singular: "Microgram",
            plural: "Micrograms",
          },
          to_anchor: 1 / 1e6,
        },
        mg: {
          name: {
            singular: "Milligram",
            plural: "Milligrams",
          },
          to_anchor: 1 / 1e3,
        },
        g: {
          name: {
            singular: "Gram",
            plural: "Grams",
          },
          to_anchor: 1,
        },
        kg: {
          name: {
            singular: "Kilogram",
            plural: "Kilograms",
          },
          to_anchor: 1e3,
        },
        mt: {
          name: {
            singular: "Metric Tonne",
            plural: "Metric Tonnes",
          },
          to_anchor: 1e6,
        },
      };
      imperial = {
        oz: {
          name: {
            singular: "Ounce",
            plural: "Ounces",
          },
          to_anchor: 1 / 16,
        },
        lb: {
          name: {
            singular: "Pound",
            plural: "Pounds",
          },
          to_anchor: 1,
        },
        t: {
          name: {
            singular: "Ton",
            plural: "Tons",
          },
          to_anchor: 2e3,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "g",
            ratio: 1 / 453.592,
          },
          imperial: {
            unit: "lb",
            ratio: 453.592,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/volume.js
  var require_volume = __commonJS({
    "node_modules/convert-units/lib/definitions/volume.js"(exports, module) {
      var metric;
      var imperial;
      metric = {
        mm3: {
          name: {
            singular: "Cubic Millimeter",
            plural: "Cubic Millimeters",
          },
          to_anchor: 1 / 1e6,
        },
        cm3: {
          name: {
            singular: "Cubic Centimeter",
            plural: "Cubic Centimeters",
          },
          to_anchor: 1 / 1e3,
        },
        ml: {
          name: {
            singular: "Millilitre",
            plural: "Millilitres",
          },
          to_anchor: 1 / 1e3,
        },
        cl: {
          name: {
            singular: "Centilitre",
            plural: "Centilitres",
          },
          to_anchor: 1 / 100,
        },
        dl: {
          name: {
            singular: "Decilitre",
            plural: "Decilitres",
          },
          to_anchor: 1 / 10,
        },
        l: {
          name: {
            singular: "Litre",
            plural: "Litres",
          },
          to_anchor: 1,
        },
        kl: {
          name: {
            singular: "Kilolitre",
            plural: "Kilolitres",
          },
          to_anchor: 1e3,
        },
        m3: {
          name: {
            singular: "Cubic meter",
            plural: "Cubic meters",
          },
          to_anchor: 1e3,
        },
        km3: {
          name: {
            singular: "Cubic kilometer",
            plural: "Cubic kilometers",
          },
          to_anchor: 1e12,
        },
        krm: {
          name: {
            singular: "Matsked",
            plural: "Matskedar",
          },
          to_anchor: 1 / 1e3,
        },
        tsk: {
          name: {
            singular: "Tesked",
            plural: "Teskedar",
          },
          to_anchor: 5 / 1e3,
        },
        msk: {
          name: {
            singular: "Matsked",
            plural: "Matskedar",
          },
          to_anchor: 15 / 1e3,
        },
        kkp: {
          name: {
            singular: "Kaffekopp",
            plural: "Kaffekoppar",
          },
          to_anchor: 150 / 1e3,
        },
        glas: {
          name: {
            singular: "Glas",
            plural: "Glas",
          },
          to_anchor: 200 / 1e3,
        },
        kanna: {
          name: {
            singular: "Kanna",
            plural: "Kannor",
          },
          to_anchor: 2.617,
        },
      };
      imperial = {
        tsp: {
          name: {
            singular: "Teaspoon",
            plural: "Teaspoons",
          },
          to_anchor: 1 / 6,
        },
        Tbs: {
          name: {
            singular: "Tablespoon",
            plural: "Tablespoons",
          },
          to_anchor: 1 / 2,
        },
        in3: {
          name: {
            singular: "Cubic inch",
            plural: "Cubic inches",
          },
          to_anchor: 0.55411,
        },
        "fl-oz": {
          name: {
            singular: "Fluid Ounce",
            plural: "Fluid Ounces",
          },
          to_anchor: 1,
        },
        cup: {
          name: {
            singular: "Cup",
            plural: "Cups",
          },
          to_anchor: 8,
        },
        pnt: {
          name: {
            singular: "Pint",
            plural: "Pints",
          },
          to_anchor: 16,
        },
        qt: {
          name: {
            singular: "Quart",
            plural: "Quarts",
          },
          to_anchor: 32,
        },
        gal: {
          name: {
            singular: "Gallon",
            plural: "Gallons",
          },
          to_anchor: 128,
        },
        ft3: {
          name: {
            singular: "Cubic foot",
            plural: "Cubic feet",
          },
          to_anchor: 957.506,
        },
        yd3: {
          name: {
            singular: "Cubic yard",
            plural: "Cubic yards",
          },
          to_anchor: 25852.7,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "l",
            ratio: 33.8140226,
          },
          imperial: {
            unit: "fl-oz",
            ratio: 1 / 33.8140226,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/each.js
  var require_each = __commonJS({
    "node_modules/convert-units/lib/definitions/each.js"(exports, module) {
      var metric;
      metric = {
        ea: {
          name: {
            singular: "Each",
            plural: "Each",
          },
          to_anchor: 1,
        },
        dz: {
          name: {
            singular: "Dozen",
            plural: "Dozens",
          },
          to_anchor: 12,
        },
      };
      module.exports = {
        metric,
        imperial: {},
        _anchors: {
          metric: {
            unit: "ea",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/temperature.js
  var require_temperature = __commonJS({
    "node_modules/convert-units/lib/definitions/temperature.js"(
      exports,
      module,
    ) {
      var metric;
      var imperial;
      metric = {
        C: {
          name: {
            singular: "degree Celsius",
            plural: "degrees Celsius",
          },
          to_anchor: 1,
          anchor_shift: 0,
        },
        K: {
          name: {
            singular: "degree Kelvin",
            plural: "degrees Kelvin",
          },
          to_anchor: 1,
          anchor_shift: 273.15,
        },
      };
      imperial = {
        F: {
          name: {
            singular: "degree Fahrenheit",
            plural: "degrees Fahrenheit",
          },
          to_anchor: 1,
        },
        R: {
          name: {
            singular: "degree Rankine",
            plural: "degrees Rankine",
          },
          to_anchor: 1,
          anchor_shift: 459.67,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "C",
            transform: function (C) {
              return C / (5 / 9) + 32;
            },
          },
          imperial: {
            unit: "F",
            transform: function (F) {
              return (F - 32) * (5 / 9);
            },
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/time.js
  var require_time = __commonJS({
    "node_modules/convert-units/lib/definitions/time.js"(exports, module) {
      var time;
      var daysInYear = 365.25;
      time = {
        ns: {
          name: {
            singular: "Nanosecond",
            plural: "Nanoseconds",
          },
          to_anchor: 1 / 1e9,
        },
        mu: {
          name: {
            singular: "Microsecond",
            plural: "Microseconds",
          },
          to_anchor: 1 / 1e6,
        },
        ms: {
          name: {
            singular: "Millisecond",
            plural: "Milliseconds",
          },
          to_anchor: 1 / 1e3,
        },
        s: {
          name: {
            singular: "Second",
            plural: "Seconds",
          },
          to_anchor: 1,
        },
        min: {
          name: {
            singular: "Minute",
            plural: "Minutes",
          },
          to_anchor: 60,
        },
        h: {
          name: {
            singular: "Hour",
            plural: "Hours",
          },
          to_anchor: 60 * 60,
        },
        d: {
          name: {
            singular: "Day",
            plural: "Days",
          },
          to_anchor: 60 * 60 * 24,
        },
        week: {
          name: {
            singular: "Week",
            plural: "Weeks",
          },
          to_anchor: 60 * 60 * 24 * 7,
        },
        month: {
          name: {
            singular: "Month",
            plural: "Months",
          },
          to_anchor: (60 * 60 * 24 * daysInYear) / 12,
        },
        year: {
          name: {
            singular: "Year",
            plural: "Years",
          },
          to_anchor: 60 * 60 * 24 * daysInYear,
        },
      };
      module.exports = {
        metric: time,
        _anchors: {
          metric: {
            unit: "s",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/digital.js
  var require_digital = __commonJS({
    "node_modules/convert-units/lib/definitions/digital.js"(exports, module) {
      var bits;
      var bytes;
      bits = {
        b: {
          name: {
            singular: "Bit",
            plural: "Bits",
          },
          to_anchor: 1,
        },
        Kb: {
          name: {
            singular: "Kilobit",
            plural: "Kilobits",
          },
          to_anchor: 1024,
        },
        Mb: {
          name: {
            singular: "Megabit",
            plural: "Megabits",
          },
          to_anchor: 1048576,
        },
        Gb: {
          name: {
            singular: "Gigabit",
            plural: "Gigabits",
          },
          to_anchor: 1073741824,
        },
        Tb: {
          name: {
            singular: "Terabit",
            plural: "Terabits",
          },
          to_anchor: 1099511627776,
        },
      };
      bytes = {
        B: {
          name: {
            singular: "Byte",
            plural: "Bytes",
          },
          to_anchor: 1,
        },
        KB: {
          name: {
            singular: "Kilobyte",
            plural: "Kilobytes",
          },
          to_anchor: 1024,
        },
        MB: {
          name: {
            singular: "Megabyte",
            plural: "Megabytes",
          },
          to_anchor: 1048576,
        },
        GB: {
          name: {
            singular: "Gigabyte",
            plural: "Gigabytes",
          },
          to_anchor: 1073741824,
        },
        TB: {
          name: {
            singular: "Terabyte",
            plural: "Terabytes",
          },
          to_anchor: 1099511627776,
        },
      };
      module.exports = {
        bits,
        bytes,
        _anchors: {
          bits: {
            unit: "b",
            ratio: 1 / 8,
          },
          bytes: {
            unit: "B",
            ratio: 8,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/partsPer.js
  var require_partsPer = __commonJS({
    "node_modules/convert-units/lib/definitions/partsPer.js"(exports, module) {
      var metric;
      metric = {
        ppm: {
          name: {
            singular: "Part-per Million",
            plural: "Parts-per Million",
          },
          to_anchor: 1,
        },
        ppb: {
          name: {
            singular: "Part-per Billion",
            plural: "Parts-per Billion",
          },
          to_anchor: 1e-3,
        },
        ppt: {
          name: {
            singular: "Part-per Trillion",
            plural: "Parts-per Trillion",
          },
          to_anchor: 1e-6,
        },
        ppq: {
          name: {
            singular: "Part-per Quadrillion",
            plural: "Parts-per Quadrillion",
          },
          to_anchor: 1e-9,
        },
      };
      module.exports = {
        metric,
        imperial: {},
        _anchors: {
          metric: {
            unit: "ppm",
            ratio: 1e-6,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/speed.js
  var require_speed = __commonJS({
    "node_modules/convert-units/lib/definitions/speed.js"(exports, module) {
      var metric;
      var imperial;
      metric = {
        "m/s": {
          name: {
            singular: "Metre per second",
            plural: "Metres per second",
          },
          to_anchor: 3.6,
        },
        "km/h": {
          name: {
            singular: "Kilometre per hour",
            plural: "Kilometres per hour",
          },
          to_anchor: 1,
        },
      };
      imperial = {
        "m/h": {
          name: {
            singular: "Mile per hour",
            plural: "Miles per hour",
          },
          to_anchor: 1,
        },
        knot: {
          name: {
            singular: "Knot",
            plural: "Knots",
          },
          to_anchor: 1.150779,
        },
        "ft/s": {
          name: {
            singular: "Foot per second",
            plural: "Feet per second",
          },
          to_anchor: 0.681818,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "km/h",
            ratio: 1 / 1.609344,
          },
          imperial: {
            unit: "m/h",
            ratio: 1.609344,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/pace.js
  var require_pace = __commonJS({
    "node_modules/convert-units/lib/definitions/pace.js"(exports, module) {
      var metric;
      var imperial;
      metric = {
        "min/km": {
          name: {
            singular: "Minute per kilometre",
            plural: "Minutes per kilometre",
          },
          to_anchor: 0.06,
        },
        "s/m": {
          name: {
            singular: "Second per metre",
            plural: "Seconds per metre",
          },
          to_anchor: 1,
        },
      };
      imperial = {
        "min/mi": {
          name: {
            singular: "Minute per mile",
            plural: "Minutes per mile",
          },
          to_anchor: 0.0113636,
        },
        "s/ft": {
          name: {
            singular: "Second per foot",
            plural: "Seconds per foot",
          },
          to_anchor: 1,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "s/m",
            ratio: 0.3048,
          },
          imperial: {
            unit: "s/ft",
            ratio: 1 / 0.3048,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/pressure.js
  var require_pressure = __commonJS({
    "node_modules/convert-units/lib/definitions/pressure.js"(exports, module) {
      var metric;
      var imperial;
      metric = {
        Pa: {
          name: {
            singular: "pascal",
            plural: "pascals",
          },
          to_anchor: 1 / 1e3,
        },
        kPa: {
          name: {
            singular: "kilopascal",
            plural: "kilopascals",
          },
          to_anchor: 1,
        },
        MPa: {
          name: {
            singular: "megapascal",
            plural: "megapascals",
          },
          to_anchor: 1e3,
        },
        hPa: {
          name: {
            singular: "hectopascal",
            plural: "hectopascals",
          },
          to_anchor: 1 / 10,
        },
        bar: {
          name: {
            singular: "bar",
            plural: "bar",
          },
          to_anchor: 100,
        },
        torr: {
          name: {
            singular: "torr",
            plural: "torr",
          },
          to_anchor: 101325 / 76e4,
        },
      };
      imperial = {
        psi: {
          name: {
            singular: "pound per square inch",
            plural: "pounds per square inch",
          },
          to_anchor: 1 / 1e3,
        },
        ksi: {
          name: {
            singular: "kilopound per square inch",
            plural: "kilopound per square inch",
          },
          to_anchor: 1,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "kPa",
            ratio: 14503768078e-14,
          },
          imperial: {
            unit: "psi",
            ratio: 1 / 14503768078e-14,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/current.js
  var require_current = __commonJS({
    "node_modules/convert-units/lib/definitions/current.js"(exports, module) {
      var current;
      current = {
        A: {
          name: {
            singular: "Ampere",
            plural: "Amperes",
          },
          to_anchor: 1,
        },
        mA: {
          name: {
            singular: "Milliampere",
            plural: "Milliamperes",
          },
          to_anchor: 1e-3,
        },
        kA: {
          name: {
            singular: "Kiloampere",
            plural: "Kiloamperes",
          },
          to_anchor: 1e3,
        },
      };
      module.exports = {
        metric: current,
        _anchors: {
          metric: {
            unit: "A",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/voltage.js
  var require_voltage = __commonJS({
    "node_modules/convert-units/lib/definitions/voltage.js"(exports, module) {
      var voltage;
      voltage = {
        V: {
          name: {
            singular: "Volt",
            plural: "Volts",
          },
          to_anchor: 1,
        },
        mV: {
          name: {
            singular: "Millivolt",
            plural: "Millivolts",
          },
          to_anchor: 1e-3,
        },
        kV: {
          name: {
            singular: "Kilovolt",
            plural: "Kilovolts",
          },
          to_anchor: 1e3,
        },
      };
      module.exports = {
        metric: voltage,
        _anchors: {
          metric: {
            unit: "V",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/power.js
  var require_power = __commonJS({
    "node_modules/convert-units/lib/definitions/power.js"(exports, module) {
      var power;
      power = {
        W: {
          name: {
            singular: "Watt",
            plural: "Watts",
          },
          to_anchor: 1,
        },
        mW: {
          name: {
            singular: "Milliwatt",
            plural: "Milliwatts",
          },
          to_anchor: 1e-3,
        },
        kW: {
          name: {
            singular: "Kilowatt",
            plural: "Kilowatts",
          },
          to_anchor: 1e3,
        },
        MW: {
          name: {
            singular: "Megawatt",
            plural: "Megawatts",
          },
          to_anchor: 1e6,
        },
        GW: {
          name: {
            singular: "Gigawatt",
            plural: "Gigawatts",
          },
          to_anchor: 1e9,
        },
      };
      module.exports = {
        metric: power,
        _anchors: {
          metric: {
            unit: "W",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/reactivePower.js
  var require_reactivePower = __commonJS({
    "node_modules/convert-units/lib/definitions/reactivePower.js"(
      exports,
      module,
    ) {
      var reactivePower;
      reactivePower = {
        VAR: {
          name: {
            singular: "Volt-Ampere Reactive",
            plural: "Volt-Amperes Reactive",
          },
          to_anchor: 1,
        },
        mVAR: {
          name: {
            singular: "Millivolt-Ampere Reactive",
            plural: "Millivolt-Amperes Reactive",
          },
          to_anchor: 1e-3,
        },
        kVAR: {
          name: {
            singular: "Kilovolt-Ampere Reactive",
            plural: "Kilovolt-Amperes Reactive",
          },
          to_anchor: 1e3,
        },
        MVAR: {
          name: {
            singular: "Megavolt-Ampere Reactive",
            plural: "Megavolt-Amperes Reactive",
          },
          to_anchor: 1e6,
        },
        GVAR: {
          name: {
            singular: "Gigavolt-Ampere Reactive",
            plural: "Gigavolt-Amperes Reactive",
          },
          to_anchor: 1e9,
        },
      };
      module.exports = {
        metric: reactivePower,
        _anchors: {
          metric: {
            unit: "VAR",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/apparentPower.js
  var require_apparentPower = __commonJS({
    "node_modules/convert-units/lib/definitions/apparentPower.js"(
      exports,
      module,
    ) {
      var apparentPower;
      apparentPower = {
        VA: {
          name: {
            singular: "Volt-Ampere",
            plural: "Volt-Amperes",
          },
          to_anchor: 1,
        },
        mVA: {
          name: {
            singular: "Millivolt-Ampere",
            plural: "Millivolt-Amperes",
          },
          to_anchor: 1e-3,
        },
        kVA: {
          name: {
            singular: "Kilovolt-Ampere",
            plural: "Kilovolt-Amperes",
          },
          to_anchor: 1e3,
        },
        MVA: {
          name: {
            singular: "Megavolt-Ampere",
            plural: "Megavolt-Amperes",
          },
          to_anchor: 1e6,
        },
        GVA: {
          name: {
            singular: "Gigavolt-Ampere",
            plural: "Gigavolt-Amperes",
          },
          to_anchor: 1e9,
        },
      };
      module.exports = {
        metric: apparentPower,
        _anchors: {
          metric: {
            unit: "VA",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/energy.js
  var require_energy = __commonJS({
    "node_modules/convert-units/lib/definitions/energy.js"(exports, module) {
      var energy;
      energy = {
        Wh: {
          name: {
            singular: "Watt-hour",
            plural: "Watt-hours",
          },
          to_anchor: 3600,
        },
        mWh: {
          name: {
            singular: "Milliwatt-hour",
            plural: "Milliwatt-hours",
          },
          to_anchor: 3.6,
        },
        kWh: {
          name: {
            singular: "Kilowatt-hour",
            plural: "Kilowatt-hours",
          },
          to_anchor: 36e5,
        },
        MWh: {
          name: {
            singular: "Megawatt-hour",
            plural: "Megawatt-hours",
          },
          to_anchor: 36e8,
        },
        GWh: {
          name: {
            singular: "Gigawatt-hour",
            plural: "Gigawatt-hours",
          },
          to_anchor: 36e11,
        },
        J: {
          name: {
            singular: "Joule",
            plural: "Joules",
          },
          to_anchor: 1,
        },
        kJ: {
          name: {
            singular: "Kilojoule",
            plural: "Kilojoules",
          },
          to_anchor: 1e3,
        },
      };
      module.exports = {
        metric: energy,
        _anchors: {
          metric: {
            unit: "J",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/reactiveEnergy.js
  var require_reactiveEnergy = __commonJS({
    "node_modules/convert-units/lib/definitions/reactiveEnergy.js"(
      exports,
      module,
    ) {
      var reactiveEnergy;
      reactiveEnergy = {
        VARh: {
          name: {
            singular: "Volt-Ampere Reactive Hour",
            plural: "Volt-Amperes Reactive Hour",
          },
          to_anchor: 1,
        },
        mVARh: {
          name: {
            singular: "Millivolt-Ampere Reactive Hour",
            plural: "Millivolt-Amperes Reactive Hour",
          },
          to_anchor: 1e-3,
        },
        kVARh: {
          name: {
            singular: "Kilovolt-Ampere Reactive Hour",
            plural: "Kilovolt-Amperes Reactive Hour",
          },
          to_anchor: 1e3,
        },
        MVARh: {
          name: {
            singular: "Megavolt-Ampere Reactive Hour",
            plural: "Megavolt-Amperes Reactive Hour",
          },
          to_anchor: 1e6,
        },
        GVARh: {
          name: {
            singular: "Gigavolt-Ampere Reactive Hour",
            plural: "Gigavolt-Amperes Reactive Hour",
          },
          to_anchor: 1e9,
        },
      };
      module.exports = {
        metric: reactiveEnergy,
        _anchors: {
          metric: {
            unit: "VARh",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/volumeFlowRate.js
  var require_volumeFlowRate = __commonJS({
    "node_modules/convert-units/lib/definitions/volumeFlowRate.js"(
      exports,
      module,
    ) {
      var metric;
      var imperial;
      metric = {
        "mm3/s": {
          name: {
            singular: "Cubic Millimeter per second",
            plural: "Cubic Millimeters per second",
          },
          to_anchor: 1 / 1e6,
        },
        "cm3/s": {
          name: {
            singular: "Cubic Centimeter per second",
            plural: "Cubic Centimeters per second",
          },
          to_anchor: 1 / 1e3,
        },
        "ml/s": {
          name: {
            singular: "Millilitre per second",
            plural: "Millilitres per second",
          },
          to_anchor: 1 / 1e3,
        },
        "cl/s": {
          name: {
            singular: "Centilitre per second",
            plural: "Centilitres per second",
          },
          to_anchor: 1 / 100,
        },
        "dl/s": {
          name: {
            singular: "Decilitre per second",
            plural: "Decilitres per second",
          },
          to_anchor: 1 / 10,
        },
        "l/s": {
          name: {
            singular: "Litre per second",
            plural: "Litres per second",
          },
          to_anchor: 1,
        },
        "l/min": {
          name: {
            singular: "Litre per minute",
            plural: "Litres per minute",
          },
          to_anchor: 1 / 60,
        },
        "l/h": {
          name: {
            singular: "Litre per hour",
            plural: "Litres per hour",
          },
          to_anchor: 1 / 3600,
        },
        "kl/s": {
          name: {
            singular: "Kilolitre per second",
            plural: "Kilolitres per second",
          },
          to_anchor: 1e3,
        },
        "kl/min": {
          name: {
            singular: "Kilolitre per minute",
            plural: "Kilolitres per minute",
          },
          to_anchor: 50 / 3,
        },
        "kl/h": {
          name: {
            singular: "Kilolitre per hour",
            plural: "Kilolitres per hour",
          },
          to_anchor: 5 / 18,
        },
        "m3/s": {
          name: {
            singular: "Cubic meter per second",
            plural: "Cubic meters per second",
          },
          to_anchor: 1e3,
        },
        "m3/min": {
          name: {
            singular: "Cubic meter per minute",
            plural: "Cubic meters per minute",
          },
          to_anchor: 50 / 3,
        },
        "m3/h": {
          name: {
            singular: "Cubic meter per hour",
            plural: "Cubic meters per hour",
          },
          to_anchor: 5 / 18,
        },
        "km3/s": {
          name: {
            singular: "Cubic kilometer per second",
            plural: "Cubic kilometers per second",
          },
          to_anchor: 1e12,
        },
      };
      imperial = {
        "tsp/s": {
          name: {
            singular: "Teaspoon per second",
            plural: "Teaspoons per second",
          },
          to_anchor: 1 / 6,
        },
        "Tbs/s": {
          name: {
            singular: "Tablespoon per second",
            plural: "Tablespoons per second",
          },
          to_anchor: 1 / 2,
        },
        "in3/s": {
          name: {
            singular: "Cubic inch per second",
            plural: "Cubic inches per second",
          },
          to_anchor: 0.55411,
        },
        "in3/min": {
          name: {
            singular: "Cubic inch per minute",
            plural: "Cubic inches per minute",
          },
          to_anchor: 0.55411 / 60,
        },
        "in3/h": {
          name: {
            singular: "Cubic inch per hour",
            plural: "Cubic inches per hour",
          },
          to_anchor: 0.55411 / 3600,
        },
        "fl-oz/s": {
          name: {
            singular: "Fluid Ounce per second",
            plural: "Fluid Ounces per second",
          },
          to_anchor: 1,
        },
        "fl-oz/min": {
          name: {
            singular: "Fluid Ounce per minute",
            plural: "Fluid Ounces per minute",
          },
          to_anchor: 1 / 60,
        },
        "fl-oz/h": {
          name: {
            singular: "Fluid Ounce per hour",
            plural: "Fluid Ounces per hour",
          },
          to_anchor: 1 / 3600,
        },
        "cup/s": {
          name: {
            singular: "Cup per second",
            plural: "Cups per second",
          },
          to_anchor: 8,
        },
        "pnt/s": {
          name: {
            singular: "Pint per second",
            plural: "Pints per second",
          },
          to_anchor: 16,
        },
        "pnt/min": {
          name: {
            singular: "Pint per minute",
            plural: "Pints per minute",
          },
          to_anchor: 4 / 15,
        },
        "pnt/h": {
          name: {
            singular: "Pint per hour",
            plural: "Pints per hour",
          },
          to_anchor: 1 / 225,
        },
        "qt/s": {
          name: {
            singular: "Quart per second",
            plural: "Quarts per second",
          },
          to_anchor: 32,
        },
        "gal/s": {
          name: {
            singular: "Gallon per second",
            plural: "Gallons per second",
          },
          to_anchor: 128,
        },
        "gal/min": {
          name: {
            singular: "Gallon per minute",
            plural: "Gallons per minute",
          },
          to_anchor: 32 / 15,
        },
        "gal/h": {
          name: {
            singular: "Gallon per hour",
            plural: "Gallons per hour",
          },
          to_anchor: 8 / 225,
        },
        "ft3/s": {
          name: {
            singular: "Cubic foot per second",
            plural: "Cubic feet per second",
          },
          to_anchor: 957.506,
        },
        "ft3/min": {
          name: {
            singular: "Cubic foot per minute",
            plural: "Cubic feet per minute",
          },
          to_anchor: 957.506 / 60,
        },
        "ft3/h": {
          name: {
            singular: "Cubic foot per hour",
            plural: "Cubic feet per hour",
          },
          to_anchor: 957.506 / 3600,
        },
        "yd3/s": {
          name: {
            singular: "Cubic yard per second",
            plural: "Cubic yards per second",
          },
          to_anchor: 25852.7,
        },
        "yd3/min": {
          name: {
            singular: "Cubic yard per minute",
            plural: "Cubic yards per minute",
          },
          to_anchor: 25852.7 / 60,
        },
        "yd3/h": {
          name: {
            singular: "Cubic yard per hour",
            plural: "Cubic yards per hour",
          },
          to_anchor: 25852.7 / 3600,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "l/s",
            ratio: 33.8140227,
          },
          imperial: {
            unit: "fl-oz/s",
            ratio: 1 / 33.8140227,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/illuminance.js
  var require_illuminance = __commonJS({
    "node_modules/convert-units/lib/definitions/illuminance.js"(
      exports,
      module,
    ) {
      var metric;
      var imperial;
      metric = {
        lx: {
          name: {
            singular: "Lux",
            plural: "Lux",
          },
          to_anchor: 1,
        },
      };
      imperial = {
        "ft-cd": {
          name: {
            singular: "Foot-candle",
            plural: "Foot-candles",
          },
          to_anchor: 1,
        },
      };
      module.exports = {
        metric,
        imperial,
        _anchors: {
          metric: {
            unit: "lx",
            ratio: 1 / 10.76391,
          },
          imperial: {
            unit: "ft-cd",
            ratio: 10.76391,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/frequency.js
  var require_frequency = __commonJS({
    "node_modules/convert-units/lib/definitions/frequency.js"(exports, module) {
      var frequency;
      frequency = {
        mHz: {
          name: {
            singular: "millihertz",
            plural: "millihertz",
          },
          to_anchor: 1 / 1e3,
        },
        Hz: {
          name: {
            singular: "hertz",
            plural: "hertz",
          },
          to_anchor: 1,
        },
        kHz: {
          name: {
            singular: "kilohertz",
            plural: "kilohertz",
          },
          to_anchor: 1e3,
        },
        MHz: {
          name: {
            singular: "megahertz",
            plural: "megahertz",
          },
          to_anchor: 1e3 * 1e3,
        },
        GHz: {
          name: {
            singular: "gigahertz",
            plural: "gigahertz",
          },
          to_anchor: 1e3 * 1e3 * 1e3,
        },
        THz: {
          name: {
            singular: "terahertz",
            plural: "terahertz",
          },
          to_anchor: 1e3 * 1e3 * 1e3 * 1e3,
        },
        rpm: {
          name: {
            singular: "rotation per minute",
            plural: "rotations per minute",
          },
          to_anchor: 1 / 60,
        },
        "deg/s": {
          name: {
            singular: "degree per second",
            plural: "degrees per second",
          },
          to_anchor: 1 / 360,
        },
        "rad/s": {
          name: {
            singular: "radian per second",
            plural: "radians per second",
          },
          to_anchor: 1 / (Math.PI * 2),
        },
      };
      module.exports = {
        metric: frequency,
        _anchors: {
          frequency: {
            unit: "hz",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/definitions/angle.js
  var require_angle = __commonJS({
    "node_modules/convert-units/lib/definitions/angle.js"(exports, module) {
      var angle;
      angle = {
        rad: {
          name: {
            singular: "radian",
            plural: "radians",
          },
          to_anchor: 180 / Math.PI,
        },
        deg: {
          name: {
            singular: "degree",
            plural: "degrees",
          },
          to_anchor: 1,
        },
        grad: {
          name: {
            singular: "gradian",
            plural: "gradians",
          },
          to_anchor: 9 / 10,
        },
        arcmin: {
          name: {
            singular: "arcminute",
            plural: "arcminutes",
          },
          to_anchor: 1 / 60,
        },
        arcsec: {
          name: {
            singular: "arcsecond",
            plural: "arcseconds",
          },
          to_anchor: 1 / 3600,
        },
      };
      module.exports = {
        metric: angle,
        _anchors: {
          metric: {
            unit: "deg",
            ratio: 1,
          },
        },
      };
    },
  });

  // node_modules/convert-units/lib/index.js
  var require_index = __commonJS({
    "node_modules/convert-units/lib/index.js"(exports, module) {
      var convert;
      var keys = require_lodash5();
      var each = require_lodash19();
      var measures = {
        length: require_length(),
        area: require_area(),
        mass: require_mass(),
        volume: require_volume(),
        each: require_each(),
        temperature: require_temperature(),
        time: require_time(),
        digital: require_digital(),
        partsPer: require_partsPer(),
        speed: require_speed(),
        pace: require_pace(),
        pressure: require_pressure(),
        current: require_current(),
        voltage: require_voltage(),
        power: require_power(),
        reactivePower: require_reactivePower(),
        apparentPower: require_apparentPower(),
        energy: require_energy(),
        reactiveEnergy: require_reactiveEnergy(),
        volumeFlowRate: require_volumeFlowRate(),
        illuminance: require_illuminance(),
        frequency: require_frequency(),
        angle: require_angle(),
      };
      var Converter;
      Converter = function (numerator, denominator) {
        if (denominator) this.val = numerator / denominator;
        else this.val = numerator;
      };
      Converter.prototype.from = function (from) {
        if (this.destination)
          throw new Error(".from must be called before .to");
        this.origin = this.getUnit(from);
        if (!this.origin) {
          this.throwUnsupportedUnitError(from);
        }
        return this;
      };
      Converter.prototype.to = function (to) {
        if (!this.origin) throw new Error(".to must be called after .from");
        this.destination = this.getUnit(to);
        var result, transform;
        if (!this.destination) {
          this.throwUnsupportedUnitError(to);
        }
        if (this.origin.abbr === this.destination.abbr) {
          return this.val;
        }
        if (this.destination.measure != this.origin.measure) {
          throw new Error(
            "Cannot convert incompatible measures of " +
              this.destination.measure +
              " and " +
              this.origin.measure,
          );
        }
        result = this.val * this.origin.unit.to_anchor;
        if (this.origin.unit.anchor_shift) {
          result -= this.origin.unit.anchor_shift;
        }
        if (this.origin.system != this.destination.system) {
          transform =
            measures[this.origin.measure]._anchors[this.origin.system]
              .transform;
          if (typeof transform === "function") {
            result = transform(result);
          } else {
            result *=
              measures[this.origin.measure]._anchors[this.origin.system].ratio;
          }
        }
        if (this.destination.unit.anchor_shift) {
          result += this.destination.unit.anchor_shift;
        }
        return result / this.destination.unit.to_anchor;
      };
      Converter.prototype.toBest = function (options) {
        if (!this.origin) throw new Error(".toBest must be called after .from");
        var options = Object.assign(
          {
            exclude: [],
            cutOffNumber: 1,
          },
          options,
        );
        var best;
        each(
          this.possibilities(),
          function (possibility) {
            var unit = this.describe(possibility);
            var isIncluded = options.exclude.indexOf(possibility) === -1;
            if (isIncluded && unit.system === this.origin.system) {
              var result = this.to(possibility);
              if (
                !best ||
                (result >= options.cutOffNumber && result < best.val)
              ) {
                best = {
                  val: result,
                  unit: possibility,
                  singular: unit.singular,
                  plural: unit.plural,
                };
              }
            }
          }.bind(this),
        );
        return best;
      };
      Converter.prototype.getUnit = function (abbr) {
        var found;
        each(measures, function (systems, measure) {
          each(systems, function (units, system) {
            if (system == "_anchors") return false;
            each(units, function (unit, testAbbr) {
              if (testAbbr == abbr) {
                found = {
                  abbr,
                  measure,
                  system,
                  unit,
                };
                return false;
              }
            });
            if (found) return false;
          });
          if (found) return false;
        });
        return found;
      };
      var describe = function (resp) {
        return {
          abbr: resp.abbr,
          measure: resp.measure,
          system: resp.system,
          singular: resp.unit.name.singular,
          plural: resp.unit.name.plural,
        };
      };
      Converter.prototype.describe = function (abbr) {
        var resp = Converter.prototype.getUnit(abbr);
        var desc = null;
        try {
          desc = describe(resp);
        } catch (err) {
          this.throwUnsupportedUnitError(abbr);
        }
        return desc;
      };
      Converter.prototype.list = function (measure) {
        var list = [];
        each(measures, function (systems, testMeasure) {
          if (measure && measure !== testMeasure) return;
          each(systems, function (units, system) {
            if (system == "_anchors") return false;
            each(units, function (unit, abbr) {
              list = list.concat(
                describe({
                  abbr,
                  measure: testMeasure,
                  system,
                  unit,
                }),
              );
            });
          });
        });
        return list;
      };
      Converter.prototype.throwUnsupportedUnitError = function (what) {
        var validUnits = [];
        each(measures, function (systems, measure) {
          each(systems, function (units, system) {
            if (system == "_anchors") return false;
            validUnits = validUnits.concat(keys(units));
          });
        });
        throw new Error(
          "Unsupported unit " + what + ", use one of: " + validUnits.join(", "),
        );
      };
      Converter.prototype.possibilities = function (measure) {
        var possibilities = [];
        if (!this.origin && !measure) {
          each(keys(measures), function (measure2) {
            each(measures[measure2], function (units, system) {
              if (system == "_anchors") return false;
              possibilities = possibilities.concat(keys(units));
            });
          });
        } else {
          measure = measure || this.origin.measure;
          each(measures[measure], function (units, system) {
            if (system == "_anchors") return false;
            possibilities = possibilities.concat(keys(units));
          });
        }
        return possibilities;
      };
      Converter.prototype.measures = function () {
        return keys(measures);
      };
      convert = function (value) {
        return new Converter(value);
      };
      module.exports = convert;
    },
  });
  return require_index();
})();

(function () {
  // Reference the file-level convertUnits variable directly
  // (window.convertUnits may not exist if degoog loads script.js in a non-global scope)
  const convert =
    typeof convertUnits === "function" ? convertUnits : window.convertUnits;

  function initUnitSlot(card) {
    if (card._uxsInit) return;
    if (typeof convert !== "function") return; // library not ready yet

    let currentMeasure = card.dataset.measure || "length";

    const amountInput = card.querySelector("#uxs-amount");
    const resultDiv = card.querySelector("#uxs-result");
    const swapBtn = card.querySelector("#uxs-swap");

    const categorySelect = card.querySelector("#uxs-category-select");
    const fromSelect = card.querySelector("#uxs-from-select");
    const toSelect = card.querySelector("#uxs-to-select");

    // Populate Category Select
    const measures = convert().measures();
    categorySelect.innerHTML = measures
      .map((m) => {
        // Title case for UI
        const name = m.split(/(?=[A-Z])/).join(" ");
        const titleName = name.charAt(0).toUpperCase() + name.slice(1);
        return `<option value="${m}">${titleName}</option>`;
      })
      .join("");
    categorySelect.value = currentMeasure;

    function populateUnits(measure) {
      const units = convert().possibilities(measure);
      const optionsHtml = units
        .map((abbr) => {
          const desc = convert().describe(abbr);
          return `<option value="${abbr}">${desc.plural}</option>`;
        })
        .join("");

      fromSelect.innerHTML = optionsHtml;
      toSelect.innerHTML = optionsHtml;
    }

    function updateResult() {
      const from = fromSelect.value;
      const to = toSelect.value;
      const amount = parseFloat(amountInput.value) || 0;

      if (!from || !to) {
        resultDiv.textContent = "";
        return;
      }

      try {
        const result = convert(amount).from(from).to(to);
        const resultStr =
          result >= 1000
            ? result.toLocaleString("en-US", { maximumFractionDigits: 2 })
            : result >= 1
              ? result.toLocaleString("en-US", { maximumFractionDigits: 4 })
              : result.toLocaleString("en-US", { maximumFractionDigits: 6 });
        resultDiv.textContent = resultStr;
      } catch (e) {
        resultDiv.textContent = "Error";
      }
    }

    function swapUnits() {
      const temp = fromSelect.value;
      fromSelect.value = toSelect.value;
      toSelect.value = temp;

      swapBtn.classList.add("spinning");
      setTimeout(() => swapBtn.classList.remove("spinning"), 400);

      updateResult();
    }

    // Initialize units for current measure
    populateUnits(currentMeasure);

    // Attempt to set initial server values if valid
    const initialFrom = fromSelect.getAttribute("data-selected");
    const initialTo = toSelect.getAttribute("data-selected");
    if (initialFrom) fromSelect.value = initialFrom;
    if (initialTo) toSelect.value = initialTo;

    // If setting initial failed (e.g. invalid measure), default to first two
    if (!fromSelect.value && fromSelect.options.length > 0)
      fromSelect.selectedIndex = 0;
    if (!toSelect.value && toSelect.options.length > 1)
      toSelect.selectedIndex = 1;

    // Listeners
    categorySelect.addEventListener("change", (e) => {
      currentMeasure = e.target.value;
      populateUnits(currentMeasure);
      if (fromSelect.options.length > 0) fromSelect.selectedIndex = 0;
      if (toSelect.options.length > 1) toSelect.selectedIndex = 1;
      updateResult();
    });

    fromSelect.addEventListener("change", updateResult);
    toSelect.addEventListener("change", updateResult);
    amountInput.addEventListener("input", updateResult);
    swapBtn.addEventListener("click", swapUnits);

    // Mark as initialized only after everything succeeded
    card._uxsInit = true;
  }

  // Find all unit slot cards and initialize them
  function scan() {
    document.querySelectorAll(".uxs-wrap").forEach(initUnitSlot);
  }

  // Run immediately, on DOMContentLoaded, and watch for dynamically-injected slot HTML
  scan();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan, { once: true });
  }
  if (document.body) {
    new MutationObserver(scan).observe(document.body, {
      childList: true,
      subtree: true,
    });
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        new MutationObserver(scan).observe(document.body, {
          childList: true,
          subtree: true,
        });
      },
      { once: true },
    );
  }
})();
