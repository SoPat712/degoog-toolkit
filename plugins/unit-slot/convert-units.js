var convert = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // node_modules/convert-units/lib/esm/index.js
  var index_exports = {};
  __export(index_exports, {
    Converter: () => Converter,
    IncompatibleUnitError: () => IncompatibleUnitError,
    MeasureStructureError: () => MeasureStructureError,
    NotAValidNumber: () => NotAValidNumber,
    OperationOrderError: () => OperationOrderError,
    UnknownMeasureError: () => UnknownMeasureError,
    UnknownUnitError: () => UnknownUnitError,
    default: () => configureMeasurements
  });

  // node_modules/convert-units/lib/esm/wrapper.js
  function isWrapper(wrapper) {
    return wrapper != null && typeof wrapper === "object" && "create" in wrapper && typeof wrapper.create === "function" && "add" in wrapper && typeof wrapper.add === "function" && "sub" in wrapper && typeof wrapper.sub === "function" && "mul" in wrapper && typeof wrapper.mul === "function" && "div" in wrapper && typeof wrapper.div === "function" && "lt" in wrapper && typeof wrapper.lt === "function" && "lte" in wrapper && typeof wrapper.lte === "function" && "gt" in wrapper && typeof wrapper.gt === "function" && "gte" in wrapper && typeof wrapper.gte === "function";
  }
  var NotAValidNumber = class extends Error {
  };

  // node_modules/convert-units/lib/esm/number_wrapper.js
  var DefaultWrapper = {
    create(value) {
      const result = Number(value);
      if (Number.isNaN(result)) {
        throw new NotAValidNumber(`"${value}" cannot be parsed into a number`);
      }
      return result;
    },
    add(left, right) {
      return Number(left) + Number(right);
    },
    sub(left, right) {
      return Number(left) - Number(right);
    },
    mul(left, right) {
      return Number(left) * Number(right);
    },
    div(left, right) {
      return Number(left) / Number(right);
    },
    lt(left, right) {
      return Number(left) < Number(right);
    },
    lte(left, right) {
      return Number(left) <= Number(right);
    },
    gt(left, right) {
      return Number(left) > Number(right);
    },
    gte(left, right) {
      return Number(left) >= Number(right);
    }
  };
  var number_wrapper_default = DefaultWrapper;

  // node_modules/convert-units/lib/esm/convert.js
  function isFraction(value) {
    return value != null && typeof value === "object" && "numerator" in value && (typeof value.numerator === "number" || typeof value.numerator === "string") && "denominator" in value && (typeof value.denominator === "number" || typeof value.denominator === "string");
  }
  var UnknownUnitError = class extends Error {
  };
  var OperationOrderError = class extends Error {
  };
  var IncompatibleUnitError = class extends Error {
  };
  var MeasureStructureError = class extends Error {
  };
  var UnknownMeasureError = class extends Error {
  };
  var Converter = class {
    constructor(options, value) {
      this.destination = null;
      this.origin = null;
      this.cls = options.cls;
      this.val = this.cls.create(value ? value : 0);
      this.measureData = options.measures;
      this.unitCache = options.unitCache;
    }
    /**
     * Lets the converter know the source unit abbreviation
     *
     * @throws OperationOrderError, UnknownUnitError
     */
    from(from) {
      if (this.destination != null)
        throw new OperationOrderError(".from must be called before .to");
      this.origin = this.getUnit(from);
      if (this.origin == null) {
        this.throwUnsupportedUnitError(from);
      }
      return this;
    }
    convertFraction(value) {
      if (isFraction(value)) {
        return this.cls.div(value.numerator, value.denominator);
      }
      return this.cls.create(value);
    }
    /**
     * Converts the unit and returns the value
     *
     * @throws OperationOrderError, UnknownUnitError, IncompatibleUnitError, MeasureStructureError
     */
    to(to) {
      var _a, _b;
      if (this.origin == null)
        throw new Error(".to must be called after .from");
      this.destination = this.getUnit(to);
      if (this.destination == null) {
        this.throwUnsupportedUnitError(to);
      }
      const destination = this.destination;
      const origin = this.origin;
      if (origin.abbr === destination.abbr) {
        return this.val;
      }
      if (destination.measure != origin.measure) {
        throw new IncompatibleUnitError(`Cannot convert incompatible measures of ${destination.measure} and ${origin.measure}`);
      }
      let result = this.cls.mul(this.val, this.convertFraction(origin.unit.to_anchor));
      if (origin.unit.anchor_shift) {
        result = this.cls.sub(result, this.convertFraction(origin.unit.anchor_shift));
      }
      if (origin.system != destination.system) {
        const measure = this.measureData[origin.measure];
        const anchors = measure.anchors;
        if (anchors == null) {
          throw new MeasureStructureError(`Unable to convert units. Anchors are missing for "${origin.measure}" and "${destination.measure}" measures.`);
        }
        const anchor = anchors[origin.system];
        if (anchor == null) {
          throw new MeasureStructureError(`Unable to find anchor for "${origin.measure}" to "${destination.measure}". Please make sure it is defined.`);
        }
        const transform = (_a = anchor[destination.system]) === null || _a === void 0 ? void 0 : _a.transform;
        const ratio = (_b = anchor[destination.system]) === null || _b === void 0 ? void 0 : _b.ratio;
        if (typeof transform === "function") {
          result = transform(result, this.cls);
        } else if (typeof ratio === "number") {
          result = this.cls.mul(result, ratio);
        } else if (isFraction(ratio)) {
          result = this.cls.mul(result, this.convertFraction(ratio));
        } else {
          throw new MeasureStructureError("A system anchor needs to either have a defined ratio number or a transform function.");
        }
      }
      if (destination.unit.anchor_shift) {
        result = this.cls.add(result, this.convertFraction(destination.unit.anchor_shift));
      }
      return this.cls.div(result, this.convertFraction(destination.unit.to_anchor));
    }
    /**
     * Converts the unit to the best available unit.
     *
     * @throws OperationOrderError
     */
    toBest(options) {
      var _a, _b, _c;
      if (this.origin == null)
        throw new OperationOrderError(".toBest must be called after .from");
      const isNegative = this.cls.lt(this.val, 0);
      let exclude = [];
      let cutOffNumber = isNegative ? -1 : 1;
      let system = this.origin.system;
      if (typeof options === "object") {
        exclude = (_a = options.exclude) !== null && _a !== void 0 ? _a : [];
        cutOffNumber = (_b = options.cutOffNumber) !== null && _b !== void 0 ? _b : cutOffNumber;
        system = (_c = options.system) !== null && _c !== void 0 ? _c : this.origin.system;
      }
      let best = null;
      for (const possibility of this.possibilities()) {
        const unit = this.describe(possibility);
        const isIncluded = exclude.indexOf(possibility) === -1;
        if (isIncluded && unit.system === system) {
          const result = this.to(possibility);
          if (isNegative ? this.cls.gt(result, cutOffNumber) : this.cls.lt(result, cutOffNumber)) {
            continue;
          }
          if (best === null || (isNegative ? this.cls.lte(result, cutOffNumber) && this.cls.gt(result, best.val) : this.cls.gte(result, cutOffNumber) && this.cls.lt(result, best.val))) {
            best = {
              val: result,
              unit: possibility,
              singular: unit.singular,
              plural: unit.plural
            };
          }
        }
      }
      if (best == null) {
        return {
          val: this.val,
          unit: this.origin.abbr,
          singular: this.origin.unit.name.singular,
          plural: this.origin.unit.name.plural
        };
      }
      return best;
    }
    /**
     * Finds the unit
     */
    getUnit(abbr) {
      var _a;
      return (_a = this.unitCache.get(abbr)) !== null && _a !== void 0 ? _a : null;
    }
    /**
     * Provides additional information about the unit
     *
     * @throws UnknownUnitError
     */
    describe(abbr) {
      const result = this.getUnit(abbr);
      if (result != null) {
        return this.describeUnit(result);
      }
      this.throwUnsupportedUnitError(abbr);
    }
    describeUnit(unit) {
      return {
        abbr: unit.abbr,
        measure: unit.measure,
        system: unit.system,
        singular: unit.unit.name.singular,
        plural: unit.unit.name.plural
      };
    }
    /**
     * Detailed list of all supported units
     *
     * If a measure is supplied the list will only contain
     * details about that measure. Otherwise the list will contain
     * details abaout all measures.
     *
     * However, if the measure doesn't exist, an empty array will be
     * returned
     *
     *
     */
    list(measureName) {
      const list = [];
      if (measureName == null) {
        for (const [name, measure] of Object.entries(this.measureData)) {
          for (const [systemName, units] of Object.entries(measure.systems)) {
            for (const [abbr, unit] of Object.entries(units)) {
              list.push(this.describeUnit({
                abbr,
                measure: name,
                system: systemName,
                unit
              }));
            }
          }
        }
      } else {
        if (!this.isMeasure(measureName))
          throw new UnknownMeasureError(`Meausure "${measureName}" not found.`);
        const measure = this.measureData[measureName];
        for (const [systemName, units] of Object.entries(measure.systems)) {
          for (const [abbr, unit] of Object.entries(units)) {
            list.push(this.describeUnit({
              abbr,
              measure: measureName,
              system: systemName,
              unit
            }));
          }
        }
      }
      return list;
    }
    isMeasure(measureName) {
      return measureName in this.measureData;
    }
    throwUnsupportedUnitError(what) {
      let validUnits = [];
      for (const measure of Object.values(this.measureData)) {
        for (const systems of Object.values(measure.systems)) {
          validUnits = validUnits.concat(Object.keys(systems));
        }
      }
      throw new UnknownUnitError(`Unsupported unit ${what}, use one of: ${validUnits.join(", ")}`);
    }
    /**
     * Returns the abbreviated measures that the value can be
     * converted to.
     */
    possibilities(forMeasure) {
      let possibilities = [];
      let list_measures = [];
      if (typeof forMeasure == "string" && this.isMeasure(forMeasure)) {
        list_measures.push(forMeasure);
      } else if (this.origin != null) {
        list_measures.push(this.origin.measure);
      } else {
        list_measures = Object.keys(this.measureData);
      }
      for (const measure of list_measures) {
        const systems = this.measureData[measure].systems;
        for (const system of Object.values(systems)) {
          possibilities = [
            ...possibilities,
            ...Object.keys(system)
          ];
        }
      }
      return possibilities;
    }
    /**
     * Returns the abbreviated measures that the value can be
     * converted to.
     */
    measures() {
      return Object.keys(this.measureData);
    }
  };
  function buildUnitCache(measures) {
    const unitCache = /* @__PURE__ */ new Map();
    for (const [measureName, measure] of Object.entries(measures)) {
      for (const [systemName, system] of Object.entries(measure.systems)) {
        for (const [testAbbr, unit] of Object.entries(system)) {
          unitCache.set(testAbbr, {
            measure: measureName,
            system: systemName,
            abbr: testAbbr,
            unit
          });
        }
      }
    }
    return unitCache;
  }
  function configureMeasurements(measures, cls) {
    if (typeof measures !== "object") {
      throw new TypeError("The measures argument needs to be an object");
    }
    const unitCache = buildUnitCache(measures);
    if (cls != null && isWrapper(cls)) {
      return (value) => new Converter({
        measures,
        unitCache,
        cls
      }, value);
    } else {
      return (value) => new Converter({
        measures,
        unitCache,
        cls: number_wrapper_default
      }, value);
    }
  }
  return __toCommonJS(index_exports);
})();
