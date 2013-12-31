var simply = (function() {

var commands = [{
  name: 'setText',
  params: [{
    name: 'title',
  }, {
    name: 'subtitle',
  }, {
    name: 'body',
  }, {
    name: 'clear',
  }],
}, {
  name: 'singleClick',
  params: [{
    name: 'button',
  }],
}, {
  name: 'longClick',
  params: [{
    name: 'button',
  }],
}, {
  name: 'accelTap',
  params: [{
    name: 'axis',
  }, {
    name: 'direction',
  }],
}, {
  name: 'vibe',
  params: [{
    name: 'type',
  }],
}, {
  name: 'setScrollable',
  params: [{
    name: 'scrollable',
  }],
}, {
  name: 'setStyle',
  params: [{
    name: 'type',
  }],
}];

var commandMap = {};

for (var i = 0, ii = commands.length; i < ii; ++i) {
  var command = commands[i];
  commandMap[command.name] = command;
  command.id = i;

  var params = command.params;
  if (!params) {
    continue;
  }

  var paramMap = command.paramMap = {};
  for (var j = 0, jj = params.length; j < jj; ++j) {
    var param = params[j];
    paramMap[param.name] = param;
    param.id = j + 1;
  }
}

var buttons = [
  'back',
  'up',
  'select',
  'down',
];

var accelAxes = [
  'x',
  'y',
  'z',
];

var vibeTypes = [
  'short',
  'long',
  'double',
];

var styleTypes = [
  'small',
  'large',
  'mono',
];

simply = {};

simply.state = {};
simply.packages = {};
simply.listeners = {};

simply.settingsUrl = 'http://meiguro.com/simplyjs/settings.html';

var wrapHandler = function(handler, level) {
  setHandlerPath(handler, null, level || 1);
  var package = simply.packages[handler.path];
  if (package) {
    return simply.protect(package.fwrap(handler), handler.path);
  } else {
    return simply.protect(handler, handler.path);
  }
};

simply.init = function() {
  if (simply.inited) {
    simply.loadMainScript();
    return;
  }

  ajax.onHandler = function(type, handler) {
    return wrapHandler(handler, 2);
  };

  Pebble.addEventListener('showConfiguration', simply.onShowConfiguration);
  Pebble.addEventListener('webviewclosed', simply.onWebViewClosed);
  Pebble.addEventListener('appmessage', simply.onAppMessage);
  simply.inited = true;

  simply.loadMainScript();
};

simply.begin = function() {
};

simply.end = function() {
  simply.state.run = false;
};

simply.reset = function() {
  simply.state = {};
  simply.packages = {};
  simply.off();
  simply.state.run = true;
  simply.state.numPackages = 0;
};

var setHandlerPath = function(handler, path, level) {
  handler.path = path || getExceptionScope(new Error(), (level || 0) + 2) || simply.basename();
  return handler;
};

simply.on = function(type, subtype, handler) {
  if (!handler) {
    handler = subtype;
    subtype = 'all';
  }
  handler = wrapHandler(handler);
  var typeMap = simply.listeners;
  var subtypeMap = (typeMap[type] || ( typeMap[type] = {} ));
  (subtypeMap[subtype] || ( subtypeMap[subtype] = [] )).push(handler);
};

simply.off = function(type, subtype, handler) {
  if (!handler) {
    handler = subtype;
    subtype = 'all';
  }
  if (!type) {
    simply.listeners = {};
    return;
  }
  var typeMap = simply.listeners;
  if (!handler && subtype === 'all') {
    delete typeMap[type];
    return;
  }
  var subtypeMap = typeMap[type];
  if (!subtypeMap) {
    return;
  }
  if (!handler) {
    delete subtypeMap[subtype];
    return;
  }
  var handlers = subtypeMap[subtype];
  if (!handlers) {
    return;
  }
  var index = handlers.indexOf(handler);
  if (index === -1) {
    return;
  }
  handlers.splice(index, 1);
};

simply.emitToHandlers = function(type, handlers, e) {
  if (!handlers) {
    return;
  }
  for (var i = 0, ii = handlers.length; i < ii; ++i) {
    var handler = handlers[i];
    if (handler(e, type, i) === false) {
      return true;
    }
  }
  return false;
};

simply.emit = function(type, subtype, e) {
  if (!simply.state.run) {
    return;
  }
  if (!e) {
    e = subtype;
    subtype = null;
  }
  var typeMap = simply.listeners;
  var subtypeMap = typeMap[type];
  if (!subtypeMap) {
    return;
  }
  if (simply.emitToHandlers(type, subtypeMap[subtype], e) === true) {
    return true;
  }
  if (simply.emitToHandlers(type, subtypeMap.all, e) === true) {
    return true;
  }
  return false;
};

var getExecPackage = function(execName) {
  var packages = simply.packages;
  for (var path in packages) {
    var package = packages[path];
    if (package && package.execName === execName) {
      return path;
    }
  }
}

var getExceptionFile = function(e, level) {
  var stack = e.stack.split('\n');
  for (var i = level || 0, ii = stack.length; i < ii; ++i) {
    var line = stack[i];
    if (line.match(/^\$\d/)) {
      var path = getExecPackage(line);
      if (path) {
        return path;
      }
    }
  }
  return stack[level];
};

var getExceptionScope = function(e, level) {
  var stack = e.stack.split('\n');
  for (var i = level || 0, ii = stack.length; i < ii; ++i) {
    var line = stack[i];
    if (!line || line.match('native code')) { continue; }
    return line.match(/^\$\d/) && getExecPackage(line) || line;
  }
  return stack[level];
};

simply.papply = function(f, args, path) {
  try {
    return f.apply(this, args);
  } catch (e) {
    simply.text({
      subtitle: !path && getExceptionFile(e) || getExecPackage(path) || path,
      body: e.line + ' ' + e.message,
    }, true);
    simply.state.run = false;
  }
};

simply.protect = function(f, path) {
  return function() {
    return simply.papply(f, arguments, path);
  };
};

simply.defun = function(fn, fargs, fbody) {
  if (!fbody) {
    fbody = fargs;
    fargs = [];
  }
  return new Function('return function ' + fn + '(' + fargs.join(', ') + ') {' + fbody + '}')();
};

var toSafeName = function(name) {
  name = name.replace(/[^0-9A-Za-z_$]/g, '_');
  if (name.match(/^[0-9]/)) {
    name = '_' + name;
  }
  return name;
}

simply.execScript = function(script, path) {
  if (!simply.state.run) {
    return;
  }
  return simply.papply(function() {
    return simply.defun(path, script)();
  }, null, path);
};

simply.loadScript = function(scriptUrl, path, async) {
  console.log('loading: ' + scriptUrl);

  if (typeof path === 'string' && !path.match(/^[^\/]*\/\//)) {
    path = path.replace(simply.basepath(), '');
  }
  var saveName = 'script:' + path;

  path = path || simply.basename();
  var execName = '$' + simply.state.numPackages++ + toSafeName(path);
  var fapply = simply.defun(execName, ['f, args'], 'return f.apply(this, args)')
  var fwrap = function(f) { return function() { return fapply(f, arguments) } }
  simply.packages[path] = {
    execName: execName,
    fapply: fapply,
    fwrap: fwrap,
  };

  var result;
  var useScript = function(data) {
    return (result = simply.packages[path].value = simply.execScript(data, execName));
  };

  ajax({ url: scriptUrl, cache: false, async: async }, function(data) {
    if (data && data.length) {
      localStorage.setItem(saveName, data);
      useScript(data);
    }
  }, function(data, status) {
    data = localStorage.getItem(saveName);
    if (data && data.length) {
      console.log(status + ': failed, loading saved script instead');
      useScript(data);
    }
  });

  return result;
};

simply.loadScriptUrl = function(scriptUrl) {
  if (scriptUrl) {
    localStorage.setItem('mainJsUrl', scriptUrl);
  } else {
    scriptUrl = localStorage.getItem('mainJsUrl');
  }

  if (scriptUrl) {
    simply.loadScript(scriptUrl, null, false);
  }
};

simply.loadMainScript = function() {
  simply.reset();
  simply.loadScriptUrl();
  simply.begin();
};

simply.basepath = function(path) {
  path = path || localStorage.getItem('mainJsUrl');
  return path.replace(/[^\/]*$/, '');
};

simply.basename = function(path) {
  path = path || localStorage.getItem('mainJsUrl');
  return path.match(/[^\/]*$/)[0];
};

simply.require = function(path) {
  if (!path.match(/\.js$/)) {
    path += '.js';
  }
  var package = simply.packages[path];
  if (package) {
    return package.value;
  }
  var basepath = simply.basepath();
  return simply.loadScript(basepath + path, path, false);
};

simply.onWebViewClosed = function(e) {
  if (!e.response) {
    return;
  }

  var options = JSON.parse(decodeURIComponent(e.response));
  simply.loadScriptUrl(options.scriptUrl);
};

simply.getOptions = function() {
  return {
    scriptUrl: localStorage.getItem('mainJsUrl'),
  };
};

simply.onShowConfiguration = function(e) {
  var options = encodeURIComponent(JSON.stringify(simply.getOptions()));
  Pebble.openURL(simply.settingsUrl + '#' + options);
};

function makePacket(command, def) {
  var packet = {};
  packet[0] = command.id;
  if (def) {
    var paramMap = command.paramMap;
    for (var k in def) {
      packet[paramMap[k].id] = def[k];
    }
  }
  return packet;
}

simply.sendPacket = function(packet) {
  if (!simply.state.run) {
    return;
  }
  var send; (send = function() {
    Pebble.sendAppMessage(packet, util2.void, send);
  })();
}

simply.setText = function(textDef, clear) {
  var command = commandMap.setText;
  var packet = makePacket(command, textDef);
  if (clear) {
    packet[command.paramMap.clear.id] = 1;
  }
  simply.sendPacket(packet);
};

simply.text = simply.setText;

simply.setTextField = function(field, text, clear) {
  var command = commandMap.setText;
  var packet = makePacket(command);
  var param = command.paramMap[field];
  if (param) {
    packet[param.id] = text;
  }
  if (clear) {
    packet[command.paramMap.clear.id] = 1;
  }
  simply.sendPacket(packet);
};

simply.title = function(text, clear) {
  simply.setTextField('title', text, clear);
};

simply.subtitle = function(text, clear) {
  simply.setTextField('subtitle', text, clear);
};

simply.body = function(text, clear) {
  simply.setTextField('body', text, clear);
};

simply.vibe = function(type) {
  var command = commandMap.vibe;
  var packet = makePacket(command);
  var vibeIndex = vibeTypes.indexOf(type);
  packet[command.paramMap.type.id] = vibeIndex !== -1 ? vibeIndex : 0;
  simply.sendPacket(packet);
};

simply.scrollable = function(scrollable) {
  if (scrollable === null) {
    return simply.state.scrollable === true;
  }
  simply.state.scrollable = scrollable;

  var command = commandMap.setScrollable;
  var packet = makePacket(command);
  packet[command.paramMap.scrollable.id] = scrollable ? 1 : 0;
  simply.sendPacket(packet);
};

simply.style = function(type) {
  var command = commandMap.setStyle;
  var packet = makePacket(command);
  var styleIndex = styleTypes.indexOf(type);
  packet[command.paramMap.type.id] = styleIndex !== -1 ? styleIndex : 1;
  simply.sendPacket(packet);
};

simply.onAppMessage = function(e) {
  var payload = e.payload;
  var code = payload[0];
  var command = commands[code];

  switch (command.name) {
    case 'singleClick':
    case 'longClick':
      var button = buttons[payload[1]];
      simply.emit(command.name, button, {
        button: button,
      });
      break;
    case 'accelTap':
      var axis = accelAxes[payload[1]];
      simply.emit(command.name, axis, {
        axis: axis,
        direction: payload[2],
      });
  }
};

return simply;

})();

var require = simply.require;
