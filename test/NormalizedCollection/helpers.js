
var _ = require('lodash');
var MockFirebase = require('mockfirebase').MockFirebase;
var Firebase = require('firebase');

addTwoDotOhStubs(MockFirebase);

//todo the stubs in here are a bit of a mess; some of them are nearly as complex as
//todo the objects they attempt to stub. Instead, those methods should be stubbed
//todo to throw errors, and the test units should specify what they return using
//todo and.callFake(...) to give back exact results, instead of having to spend so
//todo much time debugging these stubs and keeping them updated so they function
//todo like the originals

var exports = exports || {};

var PATHS = {
  p1: {id: 'path1', alias: 'p1', url: 'Mock1://path1'},
  p2: {id: 'path2', alias: 'p2', url: 'Mock1://p2parent/path2'},
  p3: {id: null,    alias: 'p3', url: 'Mock2://'},
  p4: {id: 'path4', alias: 'p4', url: 'Mock1://path4', dep: 'p3.$value'}
};

var FIELDS = [
  'p1,f10', 'p1,f11,foo', 'p1,f99',
  'p2,f20', 'p2,f99,bar',
  'p3,$key,p3key', 'p3,$value,p3val',
  'p4,$value,nest.p4val'
];

exports.doAfterTest = (function() {
  var subs = [];
  afterEach(function() {
    _.each(subs, function(fn) { fn(); });
    subs = [];
  });

  return function(fn, context) {
    subs.push(_.bind.apply(null, _.toArray(arguments)));
  }
})();

exports.liveRef = function(data, callback) {
  var ref = new Firebase('https://fbutil.firebaseio.com/test/').push();
  ref.onDisconnect().remove();
  if( data ) {
    ref.set(data, callback||function() {});
  }
  return ref;
};

/**
 * Creates a PathManager stub.
 *
 * @param {Array} [pathList] see PATHS above for example and defaults
 * @returns {object}
 */
exports.stubPathMgr = function(pathList) {
  var paths = exports.stubPaths(pathList);
  var mgr = jasmine.createSpyObj('PathManagerStub', ['getPath', 'first', 'getPathName', 'getPaths', 'getPathNames', 'count', 'getPathFor']);
  mgr.getPath.and.callFake(function(fieldName) {
    return paths[fieldName] || null;
  });
  mgr.first.and.callFake(function() { return firstFromCollection(paths); });
  mgr.getPathName.and.callFake(function(url) {
    var p = _.find(paths, function(p) {
      return p.url() === url;
    });
    return p? p.name() : null;
  });
  mgr.getPaths.and.callFake(function() {
    return _.map(paths, function(v) { return v; });
  });
  mgr.getPathNames.and.callFake(function() {
    return _.keys(paths);
  });
  mgr.count.and.callFake(function() {
    return _.keys(paths).length;
  });
  mgr.getPathFor.and.callFake(function(url) {
    return _.find(paths, function(p) {
      return p.url() === url;
    });
  });
  return mgr;
};

/**
 * Creates an array of Path stubs.
 *
 * @param {Array|Object} [paths] see PATHS above for example and defaults
 * @returns {object}
 */
exports.stubPaths = function(paths) {
  var out = {};
  _.each(paths||PATHS, function(p) {
    var path = exports.stubPath(p);
    out[path.name()] = path;
  });
  return out;
};

/**
 * Creates a Path stub.
 *
 * @param {object|string} props see PATHS above for examples and valid strings
 * @returns {object}
 */
exports.stubPath = function(props) {
  if( _.isObject(props) && typeof(props.reff) === 'function' ) {
    return props;
  }
  else if( typeof props === 'string' ) {
    props = PATHS[props];
  }
  if( !props ) { throw new Error('Invalid path props'); }
  var p = jasmine.createSpyObj('PathStub', ['name', 'id', 'url', 'child', 'ref', 'reff', 'hasDependency', 'getDependency', 'clone']);
  var ref = props.ref? props.ref : exports.mockRef(props.url);
  if( !props.url ) { props.url = ref.toString(); }
  p.name.and.callFake(function() { return props.alias || null; });
  p.id.and.callFake(function() { return props.id || null; });
  p.url.and.callFake(function() { return props.url; });
  p.child.and.callFake(function(key) {
    return exports.stubPath({id: key, alias: key, ref: ref.child(key), url: ref.child(key).toString()});
  });
  p.ref.and.callFake(function() { return ref; });
  p.reff.and.callFake(function() { return ref; });
  p.hasDependency.and.callFake(function() {
    return _.has(props, 'dep');
  });
  p.getDependency.and.callFake(function() {
    if( typeof props.dep === 'string' ) {
      var parts = props.dep.split('.');
      return {path: parts[0], field: parts[1]};
    }
    return props.dep || null;
  });
  p.clone.and.callFake(function() {
    return exports.stubPath(_.extend({}, props));
  });
  return p;
};

/**
 * Creates a Snapshot stub
 *
 * @param {object} [ref] a Ref stub (defaults to root Ref)
 * @param [data] any data to be returned by the snapshot (defaults to null)
 * @param [pri] any priority to be return (defaults to null)
 * @returns {*}
 */
exports.stubNormSnap = function(ref, data, pri) {
  if( arguments.length === 0 ) { ref = exports.stubNormRef(); }
  if( arguments.length < 2 || _.isUndefined(data) ) { data = null; }
  if( arguments.length < 3 ) { pri = null; }
  var obj = jasmine.createSpyObj('SnapshotStub',
    ['key', 'ref', 'val', 'forEach', 'child', 'hasChild', 'getPriority', 'exportVal']
  );
  obj.key.and.callFake(
    function() { return ref.key(); }
  );
  obj.ref.and.callFake(
    function() { return ref; }
  );
  obj.child.and.callFake(
    function(key) {
      return denestChildKey(obj, key, function(parent, k) {
        var cdata = parent.$$rawData();
        var pri = parent.getPriority();
        return exports.stubNormSnap(
          parent.ref().child(k),
          _.has(cdata, k)? cdata[k] : null,
          typeof pri === 'function'? pri : null
        );
      });
    }
  );
  obj.$$rawData = function() { return data; };
  obj.val.and.callFake(
    function() { return _.cloneDeep(data) }
  );
  obj.hasChild.and.callFake(
    function(key) { return _.has(data, key) && data[key] !== null; }
  );
  obj.forEach.and.callFake(
    function(callback, context) {
      var res = false;
      _.each(data, function(v,k) {
        if( res !== true ) {
          res = callback.call(context, obj.child(k)) === true;
        }
      });
      return res;
    }
  );
  obj.getPriority.and.callFake(
    function() { return typeof pri === 'function'? pri(obj) : pri; }
  );
  obj.exportVal.and.callFake(
    function() {
      var pri = obj.getPriority();
      if( _.isObject(data) ) {
        var out = {};
        if( pri !== null ) { out['.priority'] = pri; }
        obj.forEach(function(ss) {
          out[ss.key()] = ss.exportVal();
        });
        return out;
      }
      else if( pri !== null ) {
        return { '.value': data, '.priority': pri };
      }
      else {
        return data;
      }
    }
  );
  return obj;
};

/**
 * Simulates a Ref instance.
 *
 * @param {Array} [pathList] see PATHS above for example and defaults
 * @param {Array} [fieldList] see FIELDS above for defaults
 * @returns {object}
 */
exports.stubNormRef = function(pathList, fieldList) {
  var children = {};
  var paths = exports.stubPaths(pathList);
  var obj = jasmine.createSpyObj('RefStub', ['key', 'child', 'ref', 'toString', '$getRecord', '$getMaster', '$getPaths']);
  var rec = exports.stubRec(paths, fieldList, obj);
  obj.child.and.callFake(function(key) {
    if( key.indexOf('.') > 0 ) {
      var parts = key.split('.');
      var ref = obj;
      while(parts.length) {
        ref = ref.child(parts.shift());
      }
      return ref;
    }
    else if( !_.has(children, key) ) {
      var lastKey = obj.$$firstPath().name();
      children[key] = denestChildKey(obj, key, function(nextParent, nextKey) {
        var out = exports.stubNormRef(
          [nextParent.$$firstPath().child(nextKey)],
          [lastKey + ',' + nextKey]
        );
        lastKey = nextKey;
        return out;
      });
    }
    return children[key];
  });
  obj.ref.and.callFake(function() { return obj; });
  obj.key.and.callFake(function() { return pathName(paths); });
  obj.toString.and.callFake(function() { return pathString(paths); });
  obj.$getRecord.and.callFake(function() { return rec; });
  obj.$$firstPath = function() { return firstFromCollection(paths); };
  obj.$getMaster.and.callFake(function() { return rec.getPathManager().first().ref(); });
  obj.$getPaths.and.callFake(function() { return rec.getPathManager().getPaths(); });
  return obj;
};

/**
 * Generates a FieldMap stub.
 *
 * @param {Array} [fields] defaults to FIELDS above, or an object containing id, path[, alias]
 * @param {Array|object} [paths] the field manager stub or an array of fields to create it with
 * @returns {*}
 */
exports.stubFieldMap = function(fields, paths) {
  var mgr;
  if(_.isObject(paths) && typeof paths.getPathFor === 'function' ) {
    mgr = paths;
  }
  else {
    mgr = exports.stubPathMgr(paths);
  }
  var map = jasmine.createSpyObj('FieldMapStub', [
    'extractData', 'aliasFor', 'fieldsFor', 'pathFor',
    'getField', 'add', 'forEach', 'getPath', 'getPathManager',
    'idFor'
  ]);
  map.fieldsByKey = {};
  map.fieldsByAlias = {};
  map.length = (fields||FIELDS).length;
  _.each(fields || FIELDS, function(f) {
    if(_.isObject(f)) {
      field = _.extend({}, f);
      field.pathName = f.path.name();
      field.alias = field.alias || field.id;
    }
    else {
      var parts = f.split(',');
      var field = {};
      field.pathName = parts[0];
      field.id = parts[1];
      field.alias = parts[2] || parts[1];
      field.path = exports.stubPath(PATHS[field.pathName]);
    }
    field.key = field.pathName + '.' + field.id;
    field.url = field.path.url() + '/' + field.id;
    map.fieldsByKey[field.id] = field;
    map.fieldsByAlias[field.alias] = field;
  });
  map.getField.and.callFake(function(fieldName) {
    return map.fieldsByAlias[fieldName]||null;
  });
  map.key = function(path, field) { return path + '.' + field; };
  map.aliasFor.and.callFake(function(url) {
    return _.find(map.fieldsByKey, function(f) {
      return f.url === url;
    }) || null;
  });
  map.forEach = function(callback, context) {
    _.each(map.fieldsByAlias, callback, context);
  };
  map.getPathManager.and.callFake(function() { return mgr; });
  map.getPath.and.callFake(function(pathName) { return mgr.getPath(pathName); });
  map.idFor.and.callFake(function(fieldName) {
    var f = map.getField(fieldName);
    if( !f ) { return fieldName; }
    return f.id;
  });
  return map;
};

/**
 * Creates a Rec stub.
 * @param {Array|object} [pathList] defaults to PATHS above
 * @param {Array|object} [fieldList] defaults to FIELDS above
 * @param {object} [ref]
 * @returns {*}
 */
exports.stubRec = function(pathList, fieldList, ref) {
  var children = {};
  ref = ref || exports.mockRef().child('record1');
  var paths = exports.stubPaths(pathList);
  var mgr = exports.stubPathMgr(paths);
  var fieldMap = exports.stubFieldMap(fieldList, mgr);
  var rec = jasmine.createSpyObj('RecordStub',
    ['getPathManager', 'mergeData', 'child', 'getChildSnaps', 'hasChild', 'forEachKey',
      'getFieldMap', 'setRef', 'watch', 'unwatch', 'getClass', 'saveData', 'trigger',
      'getPriority', 'makeChild', 'getRef', 'getUrl', 'getName']
  );
  rec.$spies = [];
  rec.getPathManager.and.callFake(function() {
    return mgr;
  });
  rec.child.and.callFake(function(key) {
    if( !children[key] ) {
      var p = firstFromCollection(paths);
      children[key] = exports.stubRec([p.child(key)], [{path: p, id: key}], ref.child(key));
    }
    return children[key];
  });
  rec.watch.and.callFake(function(event, callback, ctx) {
    rec.$spies.push({ event: event, fn: callback, ctx: ctx });
  });
  rec.$$getPaths = function() { return paths; };
  rec.mergeData.and.callFake(function(snaps, isExport) {
    var dat = exports.deepExtend.apply(null, _.map(snaps, function(snap) {
      var val = isExport? snap.exportVal() : snap.val();
      if( !_.isObject(val) ) { val = {'.value': val}; }
      return val;
    }));
    return _.isObject(dat) && _.isEmpty(dat)? null : (!isExport && _.isEqual(_.keys(dat), ['.value'])? dat['.value'] : dat);
  });
  rec.getChildSnaps.and.callFake(function(snaps, fieldName) {
    var f = fieldMap.getField(fieldName);
    var key = f? f.alias : fieldName;
    return [(_.find(snaps, function(ss) {
      return !f || f.url === ss.ref().toString();
    })||snaps[0]).child(key)];
  });
  rec.forEachKey.and.callFake(function(snaps, iterator, context) {
    function shouldIterate(f) {
      switch(f.id) {
        case '$key':
          return true;
        case '$value':
          break;
        default:
          return !!_.find(snaps, function(snap) {
            return snap.hasChild(f.id) && snap.ref().toString() === f.path.url();
          });
      }
    }
    rec.setRef.and.callFake(function(newRef) {
      ref = newRef;
    });
    rec.getRef.and.callFake(function() {
      return ref;
    });
    var res = false;
    _.each(fieldMap.fieldsByKey, function(f) {
      if( shouldIterate(f) ) {
        res = iterator.call(context, f.id, f.alias) === true;
        return !res; // _.each takes false to abort, our forEach methods take true
      }
    });
    return res;
  });
  rec.hasChild.and.callFake(function(snaps, key) {
    var f = fieldMap.getField(key);
    if( f !== null ) {
      return _.contains(snaps, function(snap) {
        return snap.forEach(function(ss) {
          return f.id === ss.name();
        });
      });
    }
  });
  rec.getFieldMap.and.callFake(function() { return fieldMap; });
  rec.getClass.and.callFake(function() { return function() {
    return exports.stubRec(pathList, fieldList);
  }});
  rec.makeChild.and.callFake(function(key) { return rec.child(key); });
  rec.getUrl.and.callFake(function() {
    var urls = _.map(paths, function(p) { return p.url(); });
    return urls.length === 1? urls[0] : '[' + urls.join('][') + ']';
  });
  rec.getName.and.callFake(function() {
    var names = _.map(paths, function(p) { return p.name(); });
    return names.length === 1? names[0] : '[' + names.join('][') + ']';
  });
  return rec;
};

exports.deepExtend = function() {
  var args = _.toArray(arguments);
  var base = args.shift();
  if( args.length === 0 ) { return base; }
  if( !_.isObject(base) ) { return _.cloneDeep(args.pop()); }
  _.each(args, function(obj) {
    _.each(obj, function(v,k) {
      base[k] = exports.deepExtend(base[k], v);
    });
  });
  return base;
};

exports.snaps = function() {
  var i = 0;
  var args = _.flatten(arguments);
  var refFn = function(pathName) {
    var path = PATHS[pathName];
    return exports.mockRef(path.url);
  };
  if( typeof args[0] === 'function' ) {
    refFn = args.shift();
  }
  return _.map(args, function(snapData) {
    i++;
    var pathName = 'p'+i;
    var ref = refFn(pathName);
    return exports.stubSnap(
      ref,
      snapData,
      i
    );
  });
};

/**
 * Creates a stub for a Firebase snapshot (not a NormalizedCollection/Snapshot object)
 *
 * @param {object} fbRef
 * @param {*} [data]
 * @param {number|string|function} [pri]
 * @returns {*}
 */
exports.stubSnap = function(fbRef, data, pri) {
  if( arguments.length < 2 || _.isUndefined(data) ) { data = null; }
  if( arguments.length < 3 ) { pri = null; }
  var obj = jasmine.createSpyObj('snapshot',
    ['key', 'ref', 'val', 'forEach', 'child', 'hasChild', 'hasChildren', 'numChildren', 'getPriority', 'exportVal']
  );
  obj.key.and.callFake(
    function() {
      return fbRef.key();
    }
  );
  obj.ref.and.callFake(
    function() { return fbRef; }
  );
  obj.child.and.callFake(
    function(key) {
      return denestChildKey(obj, key, function(nextParent, nextKey) {
        var cdata = nextParent.val();
        return exports.stubSnap(
          nextParent.ref().child(nextKey),
          _.has(cdata, nextKey)? cdata[nextKey] : null,
            typeof pri === 'function'? pri : null
        );
      });
    }
  );
  obj.val.and.callFake(
    function() { return _.isObject(data)? _.cloneDeep(data) : data }
  );
  obj.hasChild.and.callFake(
    function(key) { return _.has(data, key); }
  );
  obj.hasChildren.and.callFake(
    function() { return _.isObject(data) && !_.isEmpty(data); }
  );
  obj.numChildren.and.callFake(
    function() { return _.size(data); }
  );
  obj.forEach.and.callFake(
    function(callback, context) {
      var res = false;
      _.each(data, function(v,k) {
        if( res !== true ) {
          res = callback.call(context, obj.child(k));
        }
      });
      return res;
    }
  );
  obj.getPriority.and.callFake(
    function() { return typeof pri === 'function'? pri(obj) : pri; }
  );
  obj.exportVal.and.callFake(
    function() {
      var pri = obj.getPriority(), out = null;
      if( _.isObject(data) ) {
        out = {};
        if( pri !== null ) { out['.priority'] = pri; }
        obj.forEach(function(ss) {
          out[ss.key()] = ss.exportVal();
        });
      }
      else if( pri !== null ) {
        out = { '.value': data, '.priority': pri };
      }
      else {
        out = data;
      }
      return out;
    }
  );
  return obj;
};

exports.mockRef = function(pathString) {
  var ref;
  var i = (pathString||'').indexOf('://');
  if( i > 0 ) {
    var base = pathString.substr(0, i+3);
    var child = pathString.substr(i+3);
    ref = new MockFirebase(base);
    if( child ) {
      ref = ref.child(child);
    }
  }
  else {
    ref = new MockFirebase('Mock1://');
    if( pathString ) {
      ref = ref.child(pathString);
    }
  }
  return ref;
};

exports.mergeUrl = function() {
  var args = _.toArray(arguments);
  var base = args.shift();
  while(args.length) {
    if( !/\/$/.test(base) ) {
      base += '/';
    }
    base += args.shift();
  }
  return base;
};

function pathString(paths) {
  switch(_.size(paths)) {
    case 0: return null;
    case 1: return firstFromCollection(paths).url();
    default: return '[' + _.map(paths, function(p) { return p.url(); }).join('][') + ']';
  }
}

function pathName(paths) {
  switch(_.size(paths)) {
    case 0: return null;
    case 1: return firstFromCollection(paths).name();
    default: return '[' + _.map(paths, function(p) { return p.name(); }).join('][') + ']';
  }
}

function firstFromCollection(collection) {
  var x = _.isArray(collection)? 0 : _.keys(collection)[0];
  return collection[x];
}

function denestChildKey(base, childKey, iterator) {
  var child = base;
  var parts = childKey.split('/').reverse();
  while(parts.length) {
    var k = parts.pop();
    child = iterator(child, k);
  }
  return child;
}

function addTwoDotOhStubs(Firebase) {
  _.extend(Firebase.prototype, {
    'orderByChild': function() {
      return this;
    },

    'orderByKey': function() {
      return this;
    },

    'orderByPriority': function() {
      return this;
    },

    'limitToLast': function() {
      return this;
    },

    'limitToFirst': function() {
      return this;
    },

    /** @deprecated */
    'limit': function() {
      return this;
    },

    'startAt': function() {
      return this;
    },

    'endAt': function() {
      return this;
    },

    'equalTo': function() {
      return this;
    },

    'changeEmail': function() {},

    'goOffline': function() {},

    'goOnline': function() {},

    'onDisconnect': function() {}
  });
}

return exports;