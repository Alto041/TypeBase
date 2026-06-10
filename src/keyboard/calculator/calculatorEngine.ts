export function normalizeOperators(expr: string): string {
  return expr.replace(/×/g, '*').replace(/÷/g, '/');
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return 'Error';
  }
  const rounded = Math.round(value * 1e10) / 1e10;
  const text = String(rounded);
  if (text.includes('e') || text.includes('E')) {
    return rounded.toPrecision(10).replace(/\.?0+$/, '');
  }
  return text;
}

export function applyPercent(expression: string): string {
  const expr = expression.trim();
  if (!expr) {
    return '';
  }

  const chainMatch = expr.match(/^(.+)([+\-*/])(\d+\.?\d*)$/);
  if (chainMatch) {
    const [, leftPart, operator, numberText] = chainMatch;
    const leftValue = evaluateExpression(leftPart);
    if (leftValue === null) {
      return expr;
    }
    const percent = parseFloat(numberText);
    const percentValue =
      operator === '+' || operator === '-'
        ? (leftValue * percent) / 100
        : percent / 100;
    return `${leftPart}${operator}${formatNumber(percentValue)}`;
  }

  const numberOnly = expr.match(/^(\d+\.?\d*)$/);
  if (numberOnly) {
    return formatNumber(parseFloat(numberOnly[1]) / 100);
  }

  return expr;
}

export function evaluateExpression(expression: string): number | null {
  const expr = normalizeOperators(expression.trim());
  if (!expr) {
    return null;
  }

  try {
    const tokens = tokenize(expr);
    if (tokens.length === 0) {
      return null;
    }
    return evaluateTokens(tokens);
  } catch {
    return null;
  }
}

type Token =
  | {type: 'number'; value: number}
  | {type: 'operator'; value: '+' | '-' | '*' | '/'};

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expr.length) {
    const char = expr[index];
    if (char === ' ') {
      index += 1;
      continue;
    }

    if ('+-*/'.includes(char)) {
      if (char === '-' && tokens.length === 0) {
        index += 1;
        const unary = readNumber(expr, index);
        if (!unary) {
          throw new Error('Invalid expression');
        }
        tokens.push({type: 'number', value: -unary.value});
        index = unary.nextIndex;
        continue;
      }

      if (
        char === '-' &&
        tokens.length > 0 &&
        tokens[tokens.length - 1].type === 'operator'
      ) {
        index += 1;
        const unary = readNumber(expr, index);
        if (!unary) {
          throw new Error('Invalid expression');
        }
        tokens.push({type: 'number', value: -unary.value});
        index = unary.nextIndex;
        continue;
      }

      tokens.push({type: 'operator', value: char as '+' | '-' | '*' | '/'});
      index += 1;
      continue;
    }

    const number = readNumber(expr, index);
    if (!number) {
      throw new Error('Invalid expression');
    }
    tokens.push({type: 'number', value: number.value});
    index = number.nextIndex;
  }

  if (tokens.length === 0) {
    throw new Error('Empty expression');
  }

  if (tokens[0].type === 'operator' || tokens[tokens.length - 1].type === 'operator') {
    throw new Error('Invalid expression');
  }

  return tokens;
}

function readNumber(
  expr: string,
  start: number,
): {value: number; nextIndex: number} | null {
  let index = start;
  let text = '';

  while (index < expr.length) {
    const char = expr[index];
    if ((char >= '0' && char <= '9') || char === '.') {
      text += char;
      index += 1;
      continue;
    }
    break;
  }

  if (!text || text === '.') {
    return null;
  }

  const value = parseFloat(text);
  if (Number.isNaN(value)) {
    return null;
  }

  return {value, nextIndex: index};
}

function evaluateTokens(tokens: Token[]): number {
  const output: number[] = [];
  const operators: Array<'+' | '-' | '*' | '/'> = [];
  const precedence: Record<'+' | '-' | '*' | '/', number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
  };

  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token.value);
      continue;
    }

    while (
      operators.length > 0 &&
      precedence[operators[operators.length - 1]] >= precedence[token.value]
    ) {
      applyOperator(output, operators.pop()!);
    }
    operators.push(token.value);
  }

  while (operators.length > 0) {
    applyOperator(output, operators.pop()!);
  }

  if (output.length !== 1) {
    throw new Error('Invalid expression');
  }

  return output[0];
}

function applyOperator(
  output: number[],
  operator: '+' | '-' | '*' | '/',
): void {
  const right = output.pop();
  const left = output.pop();
  if (right === undefined || left === undefined) {
    throw new Error('Invalid expression');
  }

  switch (operator) {
    case '+':
      output.push(left + right);
      break;
    case '-':
      output.push(left - right);
      break;
    case '*':
      output.push(left * right);
      break;
    case '/':
      if (right === 0) {
        throw new Error('Division by zero');
      }
      output.push(left / right);
      break;
    default:
      throw new Error('Invalid operator');
  }
}
