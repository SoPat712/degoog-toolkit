(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.safeMathParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function factorial(value) {
    if (!Number.isFinite(value) || value < 0 || Math.floor(value) !== value) {
      return NaN;
    }
    if (value > 170) return Infinity;
    let result = 1;
    for (let index = 2; index <= value; index += 1) result *= index;
    return result;
  }

  class TokenStream {
    constructor(input) {
      this.input = String(input);
      this.index = 0;
      this.current = null;
    }

    peek() {
      if (!this.current) this.current = this.read();
      return this.current;
    }

    next() {
      const token = this.peek();
      this.current = null;
      return token;
    }

    accept(type, value) {
      const token = this.peek();
      if (token.type !== type || (value !== undefined && token.value !== value)) {
        return null;
      }
      return this.next();
    }

    expect(type, value) {
      const token = this.accept(type, value);
      if (!token) {
        const expected = value === undefined ? type : JSON.stringify(value);
        throw new Error(`Expected ${expected} at position ${this.peek().index}`);
      }
      return token;
    }

    read() {
      while (/\s/.test(this.input[this.index] || "")) this.index += 1;
      const start = this.index;
      if (start >= this.input.length) {
        return { type: "eof", value: "", index: start };
      }

      const remaining = this.input.slice(start);
      const number = remaining.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
      if (number) {
        this.index += number[0].length;
        const value = Number(number[0]);
        if (!Number.isFinite(value)) throw new Error(`Invalid number at position ${start}`);
        return { type: "number", value, index: start };
      }

      const name = remaining.match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (name) {
        this.index += name[0].length;
        return { type: "name", value: name[0], index: start };
      }

      const char = this.input[this.index];
      if ("+-*/^!(),".includes(char)) {
        this.index += 1;
        return { type: "punctuation", value: char, index: start };
      }

      throw new Error(`Unsupported character ${JSON.stringify(char)} at position ${start}`);
    }
  }

  function numberNode(value) {
    return { type: "number", value };
  }

  function variableNode(name) {
    return { type: "variable", name };
  }

  function unaryNode(operator, argument) {
    return { type: "unary", operator, argument };
  }

  function binaryNode(operator, left, right) {
    return { type: "binary", operator, left, right };
  }

  function callNode(name, args) {
    return { type: "call", name, args };
  }

  function parseAst(input) {
    const tokens = new TokenStream(input);

    function parseExpression() {
      return parseAddSubtract();
    }

    function parseAddSubtract() {
      let node = parseMultiplyDivide();
      while (true) {
        const token = tokens.peek();
        if (token.type !== "punctuation" || (token.value !== "+" && token.value !== "-")) {
          return node;
        }
        tokens.next();
        node = binaryNode(token.value, node, parseMultiplyDivide());
      }
    }

    function parseMultiplyDivide() {
      let node = parseUnary();
      while (true) {
        const token = tokens.peek();
        if (token.type !== "punctuation" || (token.value !== "*" && token.value !== "/")) {
          return node;
        }
        tokens.next();
        node = binaryNode(token.value, node, parseUnary());
      }
    }

    function parseUnary() {
      const token = tokens.peek();
      if (token.type === "punctuation" && (token.value === "+" || token.value === "-")) {
        tokens.next();
        return unaryNode(token.value, parseUnary());
      }
      return parsePower();
    }

    function parsePower() {
      let node = parsePostfix();
      if (tokens.accept("punctuation", "^")) {
        node = binaryNode("^", node, parseUnary());
      }
      return node;
    }

    function parsePostfix() {
      let node = parsePrimary();
      while (tokens.accept("punctuation", "!")) node = unaryNode("!", node);
      return node;
    }

    function parsePrimary() {
      const number = tokens.accept("number");
      if (number) return numberNode(number.value);

      const name = tokens.accept("name");
      if (name) {
        if (!tokens.accept("punctuation", "(")) return variableNode(name.value);
        const args = [];
        if (!tokens.accept("punctuation", ")")) {
          do {
            args.push(parseExpression());
          } while (tokens.accept("punctuation", ","));
          tokens.expect("punctuation", ")");
        }
        return callNode(name.value, args);
      }

      if (tokens.accept("punctuation", "(")) {
        const node = parseExpression();
        tokens.expect("punctuation", ")");
        return node;
      }

      throw new Error(`Expected a number, symbol, or group at position ${tokens.peek().index}`);
    }

    const ast = parseExpression();
    tokens.expect("eof");
    return ast;
  }

  function collectSymbols(node, output) {
    if (node.type === "variable") output.add(node.name);
    else if (node.type === "unary") collectSymbols(node.argument, output);
    else if (node.type === "binary") {
      collectSymbols(node.left, output);
      collectSymbols(node.right, output);
    } else if (node.type === "call") {
      node.args.forEach((argument) => collectSymbols(argument, output));
    }
  }

  function validateNode(node, parser) {
    if (node.type === "call") {
      if (!own(parser.unaryOps, node.name) && !own(parser.functions, node.name)) {
        throw new Error(`Unsupported function: ${node.name}`);
      }
      node.args.forEach((argument) => validateNode(argument, parser));
    } else if (node.type === "unary") {
      if (!own(parser.unaryOps, node.operator)) {
        throw new Error(`Unsupported operator: ${node.operator}`);
      }
      validateNode(node.argument, parser);
    } else if (node.type === "binary") {
      validateNode(node.left, parser);
      validateNode(node.right, parser);
    }
  }

  function requireNumber(value, label) {
    if (typeof value !== "number") throw new Error(`${label} must resolve to a number`);
    return value;
  }

  function evaluateNode(node, parser, variables) {
    if (node.type === "number") return node.value;
    if (node.type === "variable") {
      if (!own(variables, node.name)) throw new Error(`Undefined variable: ${node.name}`);
      return requireNumber(variables[node.name], `Variable ${node.name}`);
    }
    if (node.type === "unary") {
      const value = requireNumber(evaluateNode(node.argument, parser, variables), "Operand");
      const operation = own(parser.unaryOps, node.operator)
        ? parser.unaryOps[node.operator]
        : null;
      if (typeof operation !== "function") throw new Error(`Unsupported operator: ${node.operator}`);
      return requireNumber(operation(value), `Operator ${node.operator}`);
    }
    if (node.type === "binary") {
      const left = requireNumber(evaluateNode(node.left, parser, variables), "Left operand");
      const right = requireNumber(evaluateNode(node.right, parser, variables), "Right operand");
      if (node.operator === "+") return left + right;
      if (node.operator === "-") return left - right;
      if (node.operator === "*") return left * right;
      if (node.operator === "/") return left / right;
      if (node.operator === "^") return Math.pow(left, right);
      throw new Error(`Unsupported operator: ${node.operator}`);
    }
    if (node.type === "call") {
      const operation = own(parser.unaryOps, node.name)
        ? parser.unaryOps[node.name]
        : own(parser.functions, node.name)
          ? parser.functions[node.name]
          : null;
      if (typeof operation !== "function") throw new Error(`Unsupported function: ${node.name}`);
      const args = node.args.map((argument) =>
        requireNumber(evaluateNode(argument, parser, variables), `Argument to ${node.name}`),
      );
      return requireNumber(operation.apply(undefined, args), `Function ${node.name}`);
    }
    throw new Error("Unsupported expression node");
  }

  class Expression {
    constructor(ast, parser) {
      this.ast = ast;
      this.parser = parser;
    }

    evaluate(variables) {
      const scope =
        variables && typeof variables === "object" && !Array.isArray(variables)
          ? variables
          : Object.create(null);
      return evaluateNode(this.ast, this.parser, scope);
    }

    symbols() {
      const symbols = new Set();
      collectSymbols(this.ast, symbols);
      return Array.from(symbols);
    }

    variables() {
      return this.symbols();
    }
  }

  class Parser {
    constructor() {
      this.unaryOps = Object.assign(Object.create(null), {
        "+": (value) => value,
        "-": (value) => -value,
        "!": factorial,
      });
      this.functions = Object.create(null);
    }

    parse(input) {
      const ast = parseAst(input);
      validateNode(ast, this);
      return new Expression(ast, this);
    }

    evaluate(input, variables) {
      return this.parse(input).evaluate(variables);
    }
  }

  return { Parser, Expression };
});
