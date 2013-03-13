/*
TODO:
  - possibly combine _delay and _getAsync into one function
  - fix memory leak: note that leak only occurs/has an effect when we're
    using asynchronous input.
*/

var _timerLength = 100; //ms
var _asyncLimit = 3;   //cycles until timeout
var _vars;
var _pc;
var _code;
var _io = {};
var _EIO;
var _flags = {
    "asyncCycles": 0,       // can be -1, 0, or between 0 and _asyncLimit
    "asyncVal": undefined,  //return value of most recent async call
    "paused": false,
    "running": false,
    "usingEIO": false
  };
var _keywords = {
    "control": {
      "While-start": true,
      "While-end": true,
      "If-start": true,
      "Else-start": true,
      "If-end": true
    },
    "inputs": {
      "Bumper": true
    },
    "outputs": {
      "Led": true
    },
    "output": {
      "On": true,
      "Off": true,
      "Tog": true
    },
    "comp": {
      "Eq": true,
      "Less": true,
      "Greater": true,
      "Leq": true,
      "Geq": true
    },
    "logic": {
      "Or": true,
      "And": true,
      "Not": true
    },
    "arith": {
      "Add": true,
      "Sub": true,
      "Mul": true,
      "Div": true,
      "Mod": true
    },
    "assign": {
      "Set": true,
      "Setasync": true
    },
    "info": {
      "Alert": true,
      "Log": true
    },
    "delay": {
      "Delay": true
    }
};

//split a semicolon-seperated string into an array of code lines.
//also, remove new-lines
function _splitLines (rawCode) {
  var filteredCode = "";
  for (var i = 0; i < rawCode.length; i++) {
    var c = rawCode[i];
    if (c !== "\n" && c !== "\r") filteredCode += c;
  }

  var splitCode = [];
  var start = 0;
  for (var end = 0; end < filteredCode.length; end++) {
    var c = filteredCode[end];
    if (c === ";" || c === ":") {
      splitCode.push(filteredCode.slice(start, end));
      start = end + 1;
    }
  }

  //ensure that semi-colons were placed correctly.
  //otherwise, some code has been lost, so return undefined
  if (filteredCode[end - 1] === ";" || filteredCode[end - 1] === ":") {
    return splitCode;
  } else {
    return undefined;
  }
}

//break one line of code into tokens.
//tokens can be delimited by " " or parens,
//and parens are tokens themselves
function _tokenize (ins) {
  //strip leading whitespace
  var i = 0;
  while (ins[i] === " " || ins[i] === "\n") {
    i++;
  }
  ins = ins.slice(i);

  //build array of tokens
  var tokens = [];
  var start = 0;
  for (var end = 0; end < ins.length + 1; end++) {
    if (end === ins.length || ins[end] === " " || ins[end] === ")") {
      //got to the end of a token
      var token = ins.slice(start, end);
      tokens.push(token);
      start = end + 1;
    }    
    if (ins[end] === "(" || ins[end] === ")") {
      //parens will always be tokens
      tokens.push(ins[end]);
      start = end + 1;
    }
  }

  //filter empty tokens
  var nonEmpties = [];
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i] !== "") nonEmpties.push(tokens[i]);
  }

  return nonEmpties;
}

//attempt to interpret x as a string corresponding to a primitive value.
//  If this is possible, return that primitive.
//  Otherwise, return undefined.
//  Currently only supports numbers and bools
function _parsePrimitive(op) {
  var toInt = parseInt(op);
  if (!isNaN(toInt)) return toInt;

  if (op === true || op === "true") return true;
  if (op === false || op === "false") return false;

  return undefined;
}

//evaluate an expression, given as a list of tokens.
//the expression will evaluate to a value to be used
//in larger instructions.
function _evalExpression (tokens) {
  //remove wrapping parens, if they exist
  while (tokens[0] === "(") {
    if (tokens[tokens.length - 1] !== ")"){
      _exit("_evalExpression recieved invalid expression"
            + JSON.stringify(tokens));
      return undefined;
    }
    tokens = tokens.slice(1, tokens.length - 1);
  }

  //make sure expression is well-formed
  var op = tokens[0];
  if (op === undefined)
    _exit("_evalExpression received invalid expression "
          + JSON.stringify(tokens));

  var primitive = _parsePrimitive(op);
  if (primitive !== undefined) {
    //op is actually an int or bool
    return primitive;
  } else if (op in _vars) {
    //op is actually a variable
    return _vars[op];
  } else if (op in _keywords.comp) {
    return _evalComp(tokens);
  } else if (op in _keywords.logic) {
    return _evalLogic(tokens);
  } else if (op in _keywords.arith) {
    return _evalArith(tokens);
  } else {
    _exit("_evalExpression received invalid expression "
          + JSON.stringify(tokens));
    return undefined;
  }
}

//given a sequence of possibly paren-enclosed expressions,
//  evaluate the expressions and return their values in an array
function _evalArgs (tokens) {
  var evaledArgs = [];
  var start = 0;
  var depth = 0;
  for (var end = 0; end < tokens.length; end++) {
    if (tokens[end] === "(") depth++;
    else if (tokens[end] === ")") depth --;
    if (depth === 0) {
      var arg = tokens.slice(start, end + 1);
      evaledArgs.push(_evalExpression(arg));
      start = end + 1;
    }
  }
  return evaledArgs;
}

function _evalComp (tokens) {
  var op = tokens[0];
  var args = _evalArgs(tokens.slice(1));
  var val0 = args[0];
  var val1 = args[1];
  if (val0 === undefined || val1 === undefined || 
      isNaN(parseInt(val0)) || isNaN(parseInt(val1))) {
    _exit("_evalComp received invalid expression "
          + JSON.stringify(tokens));
    return undefined;
  }

  if (op === "Eq") {
     return (val0 === val1);
  } else if (op === "Less") {
    return (val0 < val1);
  } else if (op === "Greater") {
    return (val0 > val1);
  } else if (op === "Leq") {
    return (val0 <= val1);
  } else if (op === "Geq") {
    return (val0 >= val1);
  } else {
    _exit("_evalComp received invalid expression "
          + JSON.stringify(tokens));
  }
}

function _evalLogic (tokens) {
  var op = tokens[0];
  var args = _evalArgs(tokens.slice(1));
  var val0 = args[0];
  var val1 = args[1];
  if (val0 === undefined || !(val0 === true || val0 === false)) {
    _exit("_evalLogic received invalid expression "
          + JSON.stringify(tokens));
    return undefined;
  }
  if ((val1 === undefined || !(val1 === true || val1 === false))
      && op !== "Not") {
    _exit("_evalLogic received invalid expression "
          + JSON.stringify(tokens));
    return undefined;
  }

  if (op === "Or") {
    return (val0 || val1); 
  } else if (op === "And") {
    return (val0 && val1);
  } else if (op === "Not") {
    return (!val0);
  } else {
    _exit("_evalLogic received invalid expression "
          + JSON.stringify(tokens));
  }
}

function _evalArith (tokens) {
  var op = tokens[0];
  var args = _evalArgs(tokens.slice(1));
  var val0 = args[0];
  var val1 = args[1];
  if (val0 === undefined || isNaN(parseInt(val0)) ||
      val1 === undefined || isNaN(parseInt(val1))) {
    _exit("_evalArith received invalid expression "
          + JSON.stringify(tokens));
    return undefined;
  }
  
  if (op === "Add") {
    return val0 + val1;
  } else if (op === "Sub") {
    return val0 - val1;
  } else if (op === "Mul") {
    return val0 * val1;
  } else if (op === "Div") {
    if (val1 === 0) {
      _exit("div by 0 in _evalArith");
      return undefined;
    }
    return Math.floor(val1 / val0);
  } else if (op === "Mod") {
    if (val1 === 0) {
      _exit("mod by 0 in _evalArith");
      return undefined;
    }
    return val0 % val1;
  } else {
    _exit("_evalArith received invalid expression "
          + JSON.stringify(tokens));
  }
}

//execute a whole instruction, given as a list of tokens
function _execInstruction (tokens) {
  var main = tokens[0];
  if (main === undefined) {
    _exit("_execInstruction received invalid instruction "
          + JSON.stringify(tokens));
    return undefined;
  }

  if (main in _keywords.control) {
    _execControl(tokens);
  } else if (main in _keywords.output) {
    _execOutput(tokens);
  } else if (main in _keywords.assign) {
    _execAssign(tokens);
  } else if (main in _keywords.info) {
    _execInfo(tokens);
  } else if (main in _keywords.delay) {
    _execDelay(tokens);
  } else {
    _exit("_execInstruction received invalid instruction "
          + JSON.stringify(tokens));
  }
}

//move _pc through the program in the given direction 
//  until an instruction with the given prefix is found.
function _seek (startPrefix, destPrefix, direction) {
  if (!(direction === "forward" || direction === "backward")) {
    _exit("_seek received invalid direction " + direction);
    return undefined;
  }

  var step = (direction === "forward") ? 1 : -1;
  var depth = 1;
  do {
    _pc += step;
    var ins = _code[_pc];
    if (ins.indexOf(startPrefix) >= 0) {
      depth++;
    } else if (ins.indexOf(destPrefix) >= 0) {
      depth--;
    }
  } while (!(ins.indexOf(destPrefix) >= 0 && depth === 0));
}

//execute control instruction. Must be of the form:
//  [<While/If>-start, <condition>]
function _execControl (tokens) {
  var main = tokens[0];

  if (main === "While-start") {
    var condition = tokens.slice(1);
    if (_evalExpression(condition) === true) {
      //continue
    } else {
      //seek out the corresponding While-end
      _seek("While-start", "While-end", "forward");
    }

  } else if (main === "While-end") {
    //we successfuly ran through a while-loop,
    //so run back up to the instruction directly before the While-start
    _seek("While-end", "While-start", "backward");
    _pc--;

  } else if (main === "If-start") {
    var condition = tokens.slice(1);
    if (_evalExpression(condition) === true) {
      //continue: no action required
    } else {
      //seek out corresponding Else-start
      _seek("If-start", "Else-start", "forward");
    }  
  
  } else if (main === "Else-start") {
    _seek("Else-start", "If-end", "forward");

  } else if (main === "If-end") {
    //continue: no action required

  } else {
    _exit("_execControl received invalid instruction "
          + JSON.stringify(tokens));
  }
}

//execute output instruction. Must be of the form:
//  [<iomethod>, <output>]
function _execOutput (tokens) {
  var main = tokens[0];
  var output = tokens[1];
  if (output === undefined || !(output in _keywords.outputs)) {
    _exit("_execOutput recieved invalid output " + output);
    return undefined;
  }
  
  if (_flags.usingEio !== true) {
    _exit(main + " cannot be used if EIO is not connected.");
    return undefined;
  }

  if (main === "On") {
    _io[output].setOn();
  } else if (main === "Off") {
    _io[output].setOff();
  } else if (main === "Tog") {
    _io[output].toggle();
  } else {
    _exit("_execOutput received invalid instruction "
          + JSON.stringify(tokens));
  }
}

//given the name of an input which must be called asynchronously,
//  manage flags surrounding the call and eventually return its value.
//  _getAsync expects to be called repeatedly until it set
//  _flags.waiting to "returned"
function _getAsync (input) {
  var cycles = _flags.asyncCycles;
  console.log("cycles: ");
  console.log(_flags.asyncCycles);
  if (cycles === 0) {
    //ready to make a new call
    _flags.asyncVal = undefined;
    _flags.asyncCycles++;

    //make the async call
    _io[input].getValue(function (val) {
      _flags.asyncCycles = -1;
      _flags.asyncVal = val;
    });
    return undefined;

  } else if (0 < cycles && cycles <= _asyncLimit) {
    //if the call has already been made
    _flags.asyncCycles++;
    return undefined;
  
  } else if (_asyncLimit < cycles) {
    //the call has timed out
    _flags.asyncCycles = 0;
    console.log("_getAsync timed out.");
    return undefined;

  } else if (cycles === -1) {
    //if the call has returned, but has not been processed
    _flags.asyncCycles = 0;
    return _flags.asyncVal;

  } else {
    _exit("_getAsync received invalid value for _flags.async " + stat);
  }
}

//make an asynchronous delay call
function _delay (time) {
  var cycles = _flags.asyncCycles;

  if (cycles === 0) {
    //ready to begin new delay
    _flags.asyncVal = undefined;
    _flags.asyncCycles++;

    //make the async call
    setTimeout(function () {
      _flags.asyncCycles = -1;
    }, time);
    return undefined;

  } else if (0 < cycles) {
    //if the delay is currently taking place
    _flags.asyncCycles++;
  
  } else if (cycles === -1) {
    //if the delay has finished, but has not been processed
    _flags.asyncCycles = 0;
    return undefined;
    
  } else {
    _exit("_delay received invalid value for _flags.async " + stat);
  }
}

//assign a value to a variable. Must be of the form
//  [Set, <variable>, <begin valueExpr>, ..., <end valueExpr>]
//or 
//  [Setasync, <variable>, <input name>]
function _execAssign (tokens) {
  var main = tokens[0];
  var variable = tokens[1];

  if (main === "Set") {
    var valueExpr = tokens.slice(2);
    if (variable === undefined || valueExpr === []) {
      _exit("_execAssign received invalid instruction "
            + JSON.stringify(tokens));
      return undefined;
    }
    var value = _evalExpression(valueExpr);
    _vars[variable] = value;

  } else if (main === "Setasync") {
    var input = tokens[2];
    if (variable === undefined || input === undefined ||
        !(input in _keywords.inputs)) {
      _exit("_execAssign received invalid instruction "
            + JSON.stringify(tokens));
      return undefined;
    }
    if (_flags.usingEio !== true) {
      _exit("You must connect EIO to get asynchronous input from " + input);
      return undefined;
    }
    var value = _getAsync(input);
    _vars[variable] = value;
    
  } else {
     _exit("_execAssign received invalid instruction "
            + JSON.stringify(tokens));
  }
}

//send debug information. Must be of the form
//  [<info keyword>, <message>]
function _execInfo (tokens) {
  var main = tokens[0];
  var message = _evalExpression(tokens.slice(1));
  if (message === undefined) {
    _exit("_execInfo received invalid instruction "
          + JSON.stringify(tokens));
    return undefined;
  }

  if (main === "Alert") {
    alert("" + message);
  } else if (main === "Log") {
    console.log("" + message);
  } else {
    _exit("_execInfo received invalid instruction " + JSON.stringify(tokens));
  }
}

//begins a delay. Tokens must be of the form:
//  [Delay, <begin time expression>, ..., <end time expression>]
function _execDelay (tokens) {
  var main = tokens[0];
  var timeExpr = tokens.slice(1);
  if (timeExpr === []) {
    _exit("_execDelay received invalid instruction "
          + JSON.stringify(tokens));
    return undefined;
  }
  var time = _evalExpression(timeExpr);

  if (main === "Delay") {
    _delay(time);
  } else {
    _exit("_execDelay received invalid instruction "
          + JSON.stringify(tokens));
  }
}

//execute the instruction corresponding the current position of _pc in code.
function _execCurrent() {
  var instruction = _code[_pc];
  var tokened = _tokenize(instruction);
  _execInstruction(tokened);
}

//called continuously.
//determine whether or not to call next instruction, stop the program, and
//increment _pc
function _timer () {
  if (!_flags.running) {
    //exit
    console.log("Stopping timer.");
  } else if (_flags.paused) {
    //stay on the current instruction
    setTimeout(_timer, _timerLength);
  } else if (_flags.asyncCycles !== 0) {
    //eval the current instruction, but don't move foward.
    //the most recent async call either has not returned or not been processed
    _execCurrent();
    setTimeout(_timer, _timerLength);
  } else if (_pc + 1 < _code.length) {
    //if we're running normally
    //and there's an instruction after the current one
    _pc++;
    _execCurrent();
    setTimeout(_timer, _timerLength);
  } else if (_pc === _code.length - 1) {
    //we've reached the end of the code
    console.log("Reached end of code.");
  } else {
    _exit("_timer reached invalid state with flags "
          + JSON.stringify(_flags));
  }
}

//an invalid state has been reached,
//  so stop running the current program
function _exit (error) {
  _flags.running = false;
  alert("Program exited with error:\n" + error);
}

//fill the _io object with valid inputs and outputs
function connectPins (eio) {
  _io["Bumper"] = new DigitalInput(PINB0, eio);
  _io["Led"] = new DigitalOutput(PINB1, eio);
  /*
  _io["claw"] = new DigitalOutput(PINB2, eio);
  _io["catapult"] = new DigitalOutput(PINB3, eio);
  _io["motor0"] = new DigitalOutput(PINB4, eio);
  _io["motor1"] = new DigitalOutput(PINB5, eio);
  */
}

//configure the EIO board and enable use of the related methods
function connect (callback) {
  _flags.usingEio = true;

  if (_EIO !== undefined) {
    //a connection to EIO has already be established, but is not
    //necessarily visible in the program.
    //this prevents multipe connections
    callback();
    return;
  }

  //if EIO is not connected, connect it
  var root = "./";
  LocalSerialPort(function (port) {
    var eioDirectory = "./";
    EIOLoader.load(function () {
      var eio = new EIO(port);
      eio.onload = function () {
        connectPins(eio);
        callback();
      };
    }, eioDirectory);
  }, root);
  
}

//reset interpreter.
//optionally, provide new code for it to run the next time run is called.
function init (code) {
  if (code !== undefined) {
    var splitCode = _splitLines(code);
    if (splitCode !== undefined) {
      _code = splitCode;
    } else {
      _exit("Code could not be split into lines.");
    }
  }

  _pc = -1;
  _vars = {};
  _flags.asyncCycles = 0;
  _flags.asyncVal = undefined;
  _flags.running = false;
  _flags.paused = false;
};

//run the interpreter one code is loaded in
function run () {
  if (_code === undefined || _code[0] === undefined) {
    _exit("You must load code before running.");
    return undefined;
  }
  init();
  _flags.running = true;
  _timer();
}
