#Schwing.js

Schwing.js contains an interpreter and environment for a mini-language which can wait for asynchronous function calls to return. Schwing.js can optionally be paired with EffortlessIO -- if it is, it provides synchronous wrappers around EffortlessIO's asynchronous functions.


##Methods

Schwing.js gives users access to three methods:

1. <code>init([code])</code> Resets the Schwing environment, stopping any code that is currently running. Optionally, new code can be loaded in through the <code>code</code> parameter. This code will be run the next time that <code>run</code> is called. This code must be written in the Schwing mini-language, which is described below.

2. <code>connect(callback)</code> Connects to an EIO board. If the connection is successful, runs the callback with no arguments.

3. <code>run()</code> Runs the most recent string of code loaded with the <code>init</code> function.


##Schwing Mini-Language

The <code>init</code> method takes a string of code which uses the following instructions and meets the following formatting rules.

###General Formatting
* Code is one continuous string.
* Instructions are seperated by semicolons or colons.
* All language keywords begin with capital letters.
* Within an instruction, parentheses may be used to group operators/operands into expressions.
  - If these expressions evaluate to a value, they can be used anywhere that that value would be used.
* Within an instruction, all keywords must be seperated by spaces.

###Control
* While-loops start with an instruction of the form <code>While-start (condition)</code>, where <code>condition</code> is an expression which evaluates to a boolean. They must end with <code>While-end</code>.
* If-statements have three parts, all of which must be present:
  1. They start with <code>If-start (condition)</code>, where <code>condition</code> is an expression which evaluates to a boolean.
  2. Before the else block, there is an <code>Else-start</code> instruction.
  3. They are terminated with a <code>If-end</code> instruction.

###Comparison
All comparison operators are prefix operators.
* <code>Eq x y</code> Checks if x and y are equal.
* <code>Less x y</code> Checks if x is less than y.
* <code>Greater x y</code> Checks if x is greater than y.
* <code>Leq x y</code> Checks if x is less than or equal to y.
* <code>Geq x y</code> Checks if x is greater than or equal to y.

###Logic
All logical operators are prefix operators.
* <code>Or x y</code> evaluates to the inclusive-OR of x and y.
* <code>And x y</code> evaluates to the logical AND of x and y.
* <code>Not x</code> evaluates to the logical NOT of x.

###Arithmetic
All arithmetic operators are prefix operators.
* <code>Add x y</code> evaluates to the sum of x and y.
* <code>Sub x y</code> evaluates to y - x.
* <code>Mul x y</code> evaluates to x * y.
* <code>Div x y</code> evaluates to y / x using integer division (result is floored).
* <code>Mod x y</code> evaluates to y % x.

###Assignment
* <code>Set var val</code> gives the variable "var" the value "val". "val" can be a primitive, and expression, or an expression containing another variable. Variables need not be declared before they can be given values.
* (EIO ONLY) <code>Setasync var input</code> sets the variable "var" equal to the value on the given input. If the given input is not valid, throws an error. A list of valid inputs if given below.

###Info
* <code>Alert val</code> creates an alert box containing the given value, which can be a primitive or a variable.
* <code>Log val</code> sends the given value, which can be a primitive or a variable, to the console.

###Timing
* <code>Delay ms</code> delays for a given number of milliseconds.

###(EIO ONLY) Output
* <code>On output</code> turns the given digital output on.
* <code>Off output</code> turns the given digital output off.
* <code>Tog output</code> toggles the value of the given digital output.

##Inputs/Outputs
* Valid inputs (this list will be expanded soon):
  - <code>Bumper</code>
* Valid outputs (this list will be expanded soon):
  - <code>Led</code>
  - <code>Catapult</code>
  - <code>Claw</code>
  - <code>[Motor0, Motor1]</code>
    * <code>[Motor0 = 0, Motor1 = 0]</code> will stop robot.
    * <code>[1, 0]</code> will turn robot left.
    * <code>[0, 0]</code> will turn robot right.
    * <code>[0, 0]</code> will drive robot forward.

##Schwing Examples
The following code will connect to EIO. Once it connects, the code will check every 200 ms to see if the bumper is pushed. If it is, it will turn the LED on. Otherwise, it will turn it off:
<pre>
  connect(function () {
    init("
      While-start (true): 
        Setasync x Bumper;
        If-start (x): 
          On Led; 
        Else-start:
          Off Led; 
        If-end; 
        Delay 200; 
      While-end;
    ");
    run();
  });
</pre>
