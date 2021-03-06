var _ = require('./util');
var File = require('./file');

var Re = {
  color: "#[0-9A-F]{6}|rgba\\([0-9,.]+\\)"
};

var positionRegex = new RegExp('^(top|left|width|height): ([\\d.-]+)px');
var borderRegex = new RegExp('^border: ([0-9.]+)px solid (#[0-9A-F]{6}|rgba\\([0-9,.]+\\))( none)?;?');
var borderRadiusRegex = new RegExp('^border-radius: ([\\d.]+)px;?');
var contentRegex = new RegExp("^content: '((.|[\n])*)'");
var fontFamilyRegex = new RegExp("^font-family: ([^;]*);?");
var fontSizeRegex = new RegExp("^font-size: (\\d+)px;?");
var colorRegex = new RegExp("^color: (#[0-9A-F]{6});?");
var opacityRegex = new RegExp("^opacity: ([0-9.]+);?");
var blendModeRegex = new RegExp("^blend-mode: ([a-z]+);?");
var backgroundRegex = new RegExp("^background: (" + Re.color + ")( blend-mode\\([a-z]+\\))?( none)?");
var backgroundImageRegexParamPart = "(url|linear-gradient|radial-gradient)\\(.+?(rgba\\(.+?\\).+?)*\\)( blend-mode\\([a-z]+\\))?( opacity\\([\\d.]+\\))?( none)?";
var backgroundImageRegex = new RegExp("^background-image: (" + backgroundImageRegexParamPart + "(, )?)+");
var lineHeightRegex = new RegExp("^line-height: ([\\d.]+)px;?");
var textAlignRegex = new RegExp("^text-align: (left|right|center)");
var letterSpacingRegex = new RegExp("^letter-spacing: ([0-9.]+)px");
var textBehaviourRegex = new RegExp("^text-behaviour: (auto|fixed)");
var transformRotateRegex = new RegExp("^transform: rotate\\(([\\d.]+)deg\\);?");
var booleanOperationRegex = new RegExp("^boolean-operation: (union|subtract|intersect|difference);?");
var blurType1Regex = new RegExp("^filter: (gaussian|background)-blur\\(([\\d.]+)px\\);?");
var blurType2Regex = new RegExp("^filter: (motion|zoom)-blur\\(([\\d.]+)px ([\\d.]+)deg\\);?");
var shadowRegex = new RegExp("^box-shadow: ((inset )?(0 |[\\d.]+px ){4}(#[0-9A-F]{6}|rgba\\([0-9,.]+\\))( none)?(, )?)+");
var displayRegex = new RegExp("^display: none");
var lockRegex = new RegExp("^lock: true");
var maskRegex = new RegExp("^mask: initial");
var textDecarationRegex = new RegExp("^text-decoration: (underline|double-underline|line-through)");
var backgroundBlendModeRegex = new RegExp("blend-mode\\(([a-z]+)\\)");
var backgroundOpacityRegex = new RegExp("opacity\\(([\\d.]+)\\)");

/**
 * @param {MSDocument} doc
 * @param {String} path - current working path
 */
function Importer(doc, path) {
  this.doc = doc;
  this.path = path;
}

Importer.prototype.import = function() {
  var blankPage = this.doc.currentPage();

  var path = _.joinPath(this.path, 'documents');
  var jsons = File.jsonFilePaths(path);
  var tree = jsonTree(jsons, path);

  jsons.sort(compareJsonFilePath.bind(null, tree));

  for (var i = 0; i < jsons.length; i++) {
    var parent = parentPos(jsons[i], tree);
    var current = currentPos(jsons[i], tree);
    var json = current.json;
    current.path = _.joinPath(path, currentPath(jsons[i]));

    if (json.type == 'page') {
      this.importPage(json, parent, current);
    } else if (json.type == 'artboard') {
      this.importArtboard(json, parent, current);
    } else if (json.type == "symbolMaster") {
      this.importSymbolMaster(json, parent, current);
    } else if (json.type == "symbol") {
      this.importSymbol(json, parent, current);
    } else if (json.type == "group") {
      this.importGroup(json, parent, current);
    } else if (json.type == "rectangle") {
      this.importRectangle(json, parent, current);
    } else if (json.type == "oval") {
      this.importOval(json, parent, current);
    } else if (json.type == "text") {
      this.importText(json, parent, current);
    } else if (json.type == "image") {
      this.importImage(json, parent, current);
    } else if (json.type == "shapePath") {
      this.importShapePath(json, parent, current);
    } else if (json.type == "combinedShape") {
      this.importCombinedShape(json, parent, current);
    } else if (json.type == "path") {
      this.importPath(json, parent, current);
    }
  }

  this.doc.removePage(blankPage);
};

Importer.prototype.importPage = function(json, parent, current) {
  var page = this.doc.addBlankPage();
  page.objectID = json.objectId;
  page.setName(json.name);
  current.object = page;
};

Importer.prototype.importArtboard = function(json, parent, current) {
  var artboard = MSArtboardGroup.alloc().init();
  artboard.objectID = json.objectId;
  artboard.setName(json.name);
  var s = parseStyle(json.styles);
  artboard.setRect(CGRectMake(s.left, s.top, s.width, s.height));
  if (s.background) {
    artboard.hasBackgroundColor = true;
    artboard.backgroundColor = _.stringToColor(s.background[0].color);
  }
  parent.object.addLayer(artboard);
  current.object = artboard;
};

Importer.prototype.importSymbolMaster = function(json, parent, current) {
  var s = parseStyle(json.styles);
  var symbol = MSSymbolMaster.alloc().initWithFrame(CGRectMake(s.left, s.top, s.width, s.height));
  symbol.objectID = json.objectId;
  symbol.setName(json.name);
  symbol.symbolID = json.symbolId;
  if (s.background) {
    symbol.hasBackgroundColor = true;
    symbol.backgroundColor = _.stringToColor(s.background[0].color);
  }
  if (parent) {
    parent.object.addLayer(symbol);
  }
  current.object = symbol;
};

Importer.prototype.importSymbol = function(json, parent, current) {
  var s = parseStyle(json.styles);
  var symbol = MSSymbolInstance.alloc().init();
  symbol.objectID = json.objectId;
  symbol.setName(json.name);
  symbol.symbolID = json.symbolId;
  symbol.setRect(CGRectMake(s.left, s.top, s.width, s.height));
  parent.object.addLayer(symbol);
  current.object = symbol;
};

Importer.prototype.importGroup = function(json, parent, current) {
  if (!_.isNull(parent) && !parent.object) {
    return;
  }

  var s = parseStyle(json.styles);
  var group = MSLayerGroup.alloc().init();
  group.objectID = json.objectId;
  group.frame = MSRect.rectWithRect(CGRectMake(s.left, s.top, s.width, s.height));
  group.setName(json.name);

  if (s.display) {
    group.isVisible = false;
  }

  if (s.lock) {
    group.isLocked = true;
  }

  if (s.opacity) {
    group.style().contextSettings().opacity = parseFloat(s.opacity);
  }

  if (s.blendMode) {
    group.style().contextSettings().blendMode = _.blendModeToNumber(s.blendMode);
  }

  if (s.rotation) {
    group.rotation = s.rotation;
  }

  if (s.shadow) {
    setShadow(group, s.shadow);
  }

  parent.object.addLayer(group);
  current.object = group;
};

Importer.prototype.importOval = function(json, parent, current) {
  if (parent.json.type !== 'combinedShape') {
    this._importShape(MSOvalShape, json, parent, current);
    return;
  }

  if (!_.isNull(parent) && !parent.object) {
    return;
  }

  var s = parseStyle(json.styles);
  var layer = MSOvalShape.alloc().init();
  layer.objectID = json.objectId;
  layer.frame = MSRect.rectWithRect(CGRectMake(s.left, s.top, s.width, s.height));

  if (s.rotation) {
    layer.rotation = s.rotation;
  }

  if (s.booleanOperation) {
    layer.booleanOperation = _.booleanOperationToNumber(s.booleanOperation);
  }

  if (s.blur) {
    setBlur(layer, s.blur);
  }

  layer.setName(json.name);
  parent.object.addLayer(layer);
};

Importer.prototype.importRectangle = function(json, parent, current) {
  if (parent.json.type !== 'combinedShape') {
    this._importShape(MSRectangleShape, json, parent, current);
    return;
  }

  if (!_.isNull(parent) && !parent.object) {
    return;
  }

  var s = parseStyle(json.styles);
  var layer = MSRectangleShape.alloc().init();
  layer.objectID = json.objectId;
  layer.frame = MSRect.rectWithRect(CGRectMake(s.left, s.top, s.width, s.height));

  if (s.rotation) {
    layer.rotation = s.rotation;
  }

  if (s.booleanOperation) {
    layer.booleanOperation = _.booleanOperationToNumber(s.booleanOperation);
  }

  if (s.blur) {
    setBlur(layer, s.blur);
  }

  layer.setName(json.name);
  parent.object.addLayer(layer);
};

Importer.prototype.importShapePath = function(json, parent, current) {
  this._importShape(MSShapePathLayer, json, parent, current);
};

Importer.prototype.importCombinedShape = function(json, parent, current) {
  this._importShape(MSShapePathLayer, json, parent, current);
};

Importer.prototype._importShape = function(type, json, parent, current) {
  if (!_.isNull(parent) && !parent.object) {
    return;
  }

  var s = parseStyle(json.styles);

  var group;
  if (type !== MSShapePathLayer) {
    var shape = type.alloc().init();
    shape.frame = MSRect.rectWithRect(CGRectMake(s.left, s.top, s.width, s.height));

    if (s.borderRadius) {
      shape.cornerRadiusFloat = s.borderRadius;
    }

    group = MSShapeGroup.shapeWithPath(shape);
  } else {
    group = MSShapeGroup.alloc().init();
    group.frame = MSRect.rectWithRect(CGRectMake(s.left, s.top, s.width, s.height));
  }
  group.objectID = json.objectId;

  if (s.borders) {
    for (var i = 0; i < s.borders.length; i++) {
      var bs = s.borders[i];
      var border = MSStyleBorder.alloc().init();
      border.thickness = bs.thickness;
      border.color = _.stringToColor(bs.color);
      if (bs.none) {
        border.isEnabled = false;
      }
      group.style().addStyleBorder(border);
    }
  }

  if (s.backgroundImage) {
    for (var i = 0; i < s.backgroundImage.length; i++) {
      var bgImage = s.backgroundImage[i];
      var imagePath = _.joinPath(current.path, bgImage.image);
      var image = NSImage.alloc().initWithContentsOfFile(imagePath);
      var imageData = MSImageData.alloc().initWithImage_convertColorSpace(image, false);

      var fill = MSStyleFill.alloc().init();
      fill.fillType = 4;
      fill.image = imageData;
      if (bgImage.none) {
        fill.isEnabled = false;
      }
      if (bgImage.blendMode) {
        fill.contextSettings().blendMode = _.blendModeToNumber(bgImage.blendMode);
      }
      if (bgImage.opacity) {
        fill.contextSettings().opacity = bgImage.opacity;
      }
      group.style().addStyleFill(fill);
    }
  }

  if (s.background) {
    for (var i = 0; i < s.background.length; i++) {
      var bg = s.background[i];
      var fill = MSStyleFill.alloc().init();
      fill.color = _.stringToColor(bg.color);
      if (bg.none) {
        fill.isEnabled = false;
      }
      if (bg.blendMode) {
        fill.contextSettings().blendMode = _.blendModeToNumber(bg.blendMode);
      }
      group.style().addStyleFill(fill);
    }
  }


  if (s.linearGradient) {
    for (var i = 0; i < s.linearGradient.length; i++) {
      var linearGradient = s.linearGradient[i];
      var fill = MSStyleFill.alloc().init();
      fill.fillType = 1;
      var stops = linearGradient.stops.map(function(stop){
        return MSGradientStop.alloc().initWithPosition_color(stop.length, _.stringToColor(stop.color));
      });
      var gradient = MSGradient.alloc().initBlankGradient();
      gradient.gradientType = 0;
      gradient.from = CGPointMake(linearGradient.from.x, linearGradient.from.y);
      gradient.to = CGPointMake(linearGradient.to.x, linearGradient.to.y);
      gradient.stops = stops;
      fill.gradient = gradient;
      group.style().addStyleFill(fill);
    }
  }

  if (s.rotation) {
    group.rotation = s.rotation;
  }

  if (s.blur) {
    setBlur(group, s.blur);
  }

  if (s.shadow) {
    setShadow(group, s.shadow);
  }

  if (s.opacity) {
    group.style().contextSettings().setOpacity(parseFloat(s.opacity));
  }

  if (s.blendMode) {
    group.style().contextSettings().blendMode = _.blendModeToNumber(s.blendMode);
  }

  if (s.display) {
    group.isVisible = false;
  }

  if (s.lock) {
    group.isLocked = true;
  }

  if (s.mask) {
    group.prepareAsMask();
  }

  group.setName(json.name);
  parent.object.addLayer(group);
  current.object = group;
};

Importer.prototype.importPath = function(json, parent, current) {
  if (!_.isNull(parent) && !parent.object) {
    return;
  }

  if (!json.path) {
    return;
  }

  var s = parseStyle(json.styles);
  var layer = MSShapePathLayer.alloc().init();
  layer.objectID = json.objectId;

  var isClose = false;
  var svgAttr = json.path;
  var regex = new RegExp(' [MLC]?([e0-9,.-]+) Z"$');
  if (regex.test(svgAttr)) {
    isClose = true;
  }
  var svg = '<svg><path ' + svgAttr + '></path></svg>';
  var path = NSBezierPath.bezierPathFromSVGString(svg);
  layer.bezierPath = path;

  if (isClose) {
    layer.closeLastPath(true);
  }

  if (s.rotation) {
    layer.rotation = s.rotation;
  }

  layer.setName(json.name);
  parent.object.addLayer(layer);
};

Importer.prototype.importText = function(json, parent, current) {
  if (_.isNull(parent) || !_.isNull(parent) && !parent.object) {
    return;
  }

  var s = parseStyle(json.styles);
  var text = MSTextLayer.alloc().init();
  text.objectID = json.objectId;

  if (s.content) {
    text.stringValue = s.content;
  }

  text.font = NSFont.fontWithName_size(s.fontFamily, s.fontSize);
  if (s.color) {
    text.textColor = _.stringToColor(s.color);
  }

  if (s.lineHeight) {
    text.lineHeight = s.lineHeight;
  }

  if (s.textAlign) {
    if (s.textAlign == 'left') {
      text.textAlignment = 0;
    } else if (s.textAlign == 'right') {
      text.textAlignment = 1;
    } else if (s.textAlign == 'center') {
      text.textAlignment = 2;
    }
  }

  if (s.letterSpacing) {
    text.characterSpacing = s.letterSpacing;
  }

  if (s.textBehaviour) {
    text.textBehaviour = s.textBehaviour == 'auto' ? 0 : 1;
  }

  if (s.rotation) {
    text.rotation = s.rotation;
  }

  if (s.blur) {
    setBlur(text, s.blur);
  }

  if (s.shadow) {
    setShadow(text, s.shadow);
  }

  if (s.display) {
    text.isVisible = false;
  }

  if (s.opacity) {
    text.style().contextSettings().opacity = parseFloat(s.opacity);
  }

  if (s.blendMode) {
    text.style().contextSettings().blendMode = _.blendModeToNumber(s.blendMode);
  }

  if (s.textDecoration) {
    if (s.textDecoration == 'underline' || s.textDecoration == 'double-underline') {
      text.addAttribute_value('NSUnderline', _.underlineToNumber(s.textDecoration));
    } else {
      text.addAttribute_value('NSStrikethrough', 1);
    }
  }

  if (s.lock) {
    text.isLocked = true;
  }

  text.frame = MSRect.rectWithRect(CGRectMake(s.left, s.top, s.width, s.height));
  text.setName(json.name);
  parent.object.addLayer(text);
};

Importer.prototype.importImage = function(json, parent, current) {
  if (!_.isNull(parent) && !parent.object) {
    return;
  }

  var s = parseStyle(json.styles);
  var imagePath = _.joinPath(current.path, s.backgroundImage[0].image);
  var image = NSImage.alloc().initWithContentsOfFile(imagePath);
  var imageData = MSImageData.alloc().initWithImage_convertColorSpace(image, false);
  var rect = NSMakeRect(s.left, s.top, s.width, s.height);
  var bitmap = MSBitmapLayer.alloc().initWithFrame_image(rect, imageData);
  bitmap.objectID = json.objectId;
  bitmap.setName(json.name);

  if (s.rotation) {
    bitmap.rotation = s.rotation;
  }

  if (s.blur) {
    setBlur(bitmap, s.blur);
  }

  if (s.shadow) {
    setShadow(bitmap, s.shadow);
  }

  if (s.display) {
    bitmap.isVisible = false;
  }

  if (s.opacity) {
    bitmap.style().contextSettings().opacity = parseFloat(s.opacity);
  }

  if (s.blendMode) {
    bitmap.style().contextSettings().blendMode = _.blendModeToNumber(s.blendMode);
  }

  if (s.lock) {
    bitmap.isLocked = true;
  }

  parent.object.addLayer(bitmap);
};

/**
 * @param {Array} jsonPaths - File.jsonFilePaths
 * @param {String} path - working dir
 */
function jsonTree(jsonPaths, path) {
  var tree = {};
  for (var i = 0; i < jsonPaths.length; i++) {
    var dirs = jsonPaths[i].pathComponents();
    var p = tree;
    for (var j = 0; j < dirs.length; j++) {
      var n = dirs[j];
      if (n.pathExtension() == 'json') {
        n = 'jsonFileName';
        p[n] = dirs[j];

        var filePath = _.joinPath(path, jsonPaths[i]);
        var jsonString = File.readFileContents(filePath);
        var json = JSON.parse(jsonString);
        p['json'] = json;
      } else {
        p[n] = p[n] || {};
      }
      p = p[n];
    }
  }
  return tree;
}

function parentPos(path, tree) {
  var p = tree;
  var components = path.pathComponents();
  for (var i = 0; i < (components.length - 2); i++) {
    var n = components[i];
    p = p[n];
  }
  if (p.jsonFileName) {
    return p;
  } else {
    return null;
  }
}

function currentPath(path) {
  var components = path.pathComponents();
  components.pop();
  return components.join('/');
}

function currentPos(path, tree) {
  var p = tree;
  var components = path.pathComponents();
  for (var i = 0; i < components.length - 1; i++) {
    var n = components[i];
    p = p[n];
  }

  return p;
}

function parseStyle(styles) {
  var re = {};
  for (var i = 0; i < styles.length; i++) {
    // positions
    if (positionRegex.test(styles[i])) {
      var ms = positionRegex.exec(styles[i]);
      var k = ms[1], v = ms[2];
      re[k] = parseFloat(v);

    // borders
    } else if (borderRegex.test(styles[i])) {
      var ms = borderRegex.exec(styles[i]);
      var thickness = ms[1], color = ms[2];

      re.borders = re.borders || [];
      var borderStyles = {
        thickness: parseFloat(thickness),
        color: color,
      };
      if (ms[3]) {
        borderStyles.none = true;
      }
      re.borders.push(borderStyles);

    // border radius
    } else if (borderRadiusRegex.test(styles[i])) {
      var ms = borderRadiusRegex.exec(styles[i]);
      re.borderRadius = ms[1];

    // text content
    } else if (contentRegex.test(styles[i])) {
      var ms = contentRegex.exec(styles[i]);
      re.content = ms[1];

    // font family
    } else if (fontFamilyRegex.test(styles[i])) {
      var ms = fontFamilyRegex.exec(styles[i]);
      re.fontFamily = ms[1];

    // font size
    } else if (fontSizeRegex.test(styles[i])) {
      var ms = fontSizeRegex.exec(styles[i]);
      re.fontSize = parseFloat(ms[1]);

    // line height
    } else if (lineHeightRegex.test(styles[i])) {
      var ms = lineHeightRegex.exec(styles[i]);
      re.lineHeight = parseFloat(ms[1]);

    // text align
    } else if (textAlignRegex.test(styles[i])) {
      var ms = textAlignRegex.exec(styles[i]);
      re.textAlign = ms[1];

    // letter spacing
    } else if (letterSpacingRegex.test(styles[i])) {
      var ms = letterSpacingRegex.exec(styles[i]);
      re.letterSpacing = parseFloat(ms[1]);

    // text behaviour
    } else if (textBehaviourRegex.test(styles[i])) {
      var ms = textBehaviourRegex.exec(styles[i]);
      re.textBehaviour = ms[1];

    // transform: rotate()
    } else if (transformRotateRegex.test(styles[i])) {
      var ms = transformRotateRegex.exec(styles[i]);
      re.rotation = parseFloat(ms[1]);

    // boolean-operation
    } else if (booleanOperationRegex.test(styles[i])) {
      var ms = booleanOperationRegex.exec(styles[i]);
      re.booleanOperation = ms[1];

    // blur: gaussian/background
    } else if (blurType1Regex.test(styles[i])) {
      var ms = blurType1Regex.exec(styles[i]);
      re.blur = { type: ms[1], radius: parseFloat(ms[2]) };

    // blur: motion/zoom
    } else if (blurType2Regex.test(styles[i])) {
      var ms = blurType2Regex.exec(styles[i]);
      re.blur = { type: ms[1], radius: parseFloat(ms[2]), angle: parseFloat(ms[3]) };

    // shadow
    } else if (shadowRegex.test(styles[i])) {
      re.shadow = parseShadow(styles[i]);

    // color
    } else if (colorRegex.test(styles[i])) {
      var ms = colorRegex.exec(styles[i]);
      re.color = ms[1];

    // opacity
    } else if (opacityRegex.test(styles[i])) {
      var ms = opacityRegex.exec(styles[i]);
      re.opacity = ms[1];

    // blendMode
    } else if (blendModeRegex.test(styles[i])) {
      var ms = blendModeRegex.exec(styles[i]);
      re.blendMode = ms[1];

    // background color
    } else if (backgroundRegex.test(styles[i])) {
      re.background = parseBackground(styles[i]);

    // background image
    } else if (backgroundImageRegex.test(styles[i])) {
      var parsedBackgroundImage = parseBackgroundImage(styles[i]);
      if (parsedBackgroundImage.image.length > 0) {
        re.backgroundImage = parsedBackgroundImage.image;
      }
      if (parsedBackgroundImage.linearGradient.length > 0) {
        re.linearGradient = parsedBackgroundImage.linearGradient;
      }

    } else if (displayRegex.test(styles[i])) {
      re.display = 'none';

    } else if (lockRegex.test(styles[i])) {
      re.lock = true;

    } else if (maskRegex.test(styles[i])) {
      re.mask = true;

    } else if (textDecarationRegex.test(styles[i])) {
      var ms = textDecarationRegex.exec(styles[i]);
      re.textDecoration = ms[1];

    } else {
      // print(styles[i]);
    }
  }
  return re;
}

function compareJsonFilePath(tree, a, b) {
  var as = a.pathComponents();
  var bs = b.pathComponents();
  var aLen = as.length;
  var bLen = bs.length;

  if (aLen == bLen && as.slice(0, -2).join('/') == bs.slice(0, -2).join('/')) {
    return currentPos(b, tree).json.index - currentPos(a, tree).json.index;
  } else {
    return aLen - bLen;
  }
}

function setBlur(layer, attr) {
  var blur = MSStyleBlur.alloc().init();
  blur.type = _.blurTypeToNumber(attr.type);
  blur.radius = attr.radius;
  if (attr.angle) {
    blur.motionAngle = attr.angle;
  }
  blur.isEnabled = true;
  layer.style().blur = blur;
}

var backgroundParamsRegex = new RegExp("(" + Re.color + ")( blend-mode\\([a-z]+\\))?( none)?");
/**
 * @param {String} style - "background: ..."
 */
function parseBackground(style) {
  var re = new Array();
  var s = style.replace(new RegExp("^background: "), '');
  s = s.replace(new RegExp(";$"), '');
  var ss = s.split(', ');

  for (var i = 0; i < ss.length; i++) {
    var ms = backgroundParamsRegex.exec(ss[i]);
    var params = { color: ms[1] };
    if (ms[2]) {
      params.blendMode = backgroundBlendModeRegex.exec(ms[2])[1];
    }
    if (ms[3]) {
      params.none = true;
    }

    re.push(params);
  }
  return re;
}

var backgroundImageParamsRegex = new RegExp("url\\(([0-9a-f]+\\.png)\\)( blend-mode\\([a-z]+\\))?( opacity\\([\\d.]+\\))?( none)?");
var linearGradientParamsRegex = new RegExp("linear-gradient\\((.+)\\)( blend-mode\\([a-z]+\\))?( none)?");
var radialGradientParamsRegex = new RegExp("radial-gradient\\((.+)\\)( blend-mode\\([a-z]+\\))?( none)?");
/**
 * @param {String} style - "background-image: ..."
 */
function parseBackgroundImage(style) {
  var re = {
    image: new Array(),
    linearGradient: new Array(),
    radialGradient: new Array()
  };
  var s = style.replace(new RegExp("^background-image: "), '');
  s = s.replace(new RegExp(";$"), '');
  var ss = s.match(new RegExp(backgroundImageRegexParamPart, 'g'));

  for (var i = 0; i < ss.length; i++) {
    if (backgroundImageParamsRegex.test(ss[i])) {
      var ms = backgroundImageParamsRegex.exec(ss[i]);
      var params = { image: ms[1] };
      if (ms[2]) {
        params.blendMode = backgroundBlendModeRegex.exec(ms[2])[1];
      }
      if (ms[3]) {
        params.opacity = parseFloat(backgroundOpacityRegex.exec(ms[3])[1]);
      }
      if (ms[4]) {
        params.none = true;
      }
      re.image.push(params);
    } else if (linearGradientParamsRegex.test(ss[i])) {
      var ms = linearGradientParamsRegex.exec(ss[i]);
      var rules = ms[1].match(new RegExp("((" + Re.color + ") ([0-9.]+))", 'g'));
      var positions = ms[1].replace(/,.+/, '').split(' ');
      rules = rules.map(function(rule){
        var re = new RegExp("(" + Re.color + ") ([0-9.]+)");
        var ms = re.exec(rule);
        return { color: ms[1], length: parseFloat(ms[2]) };
      });
      re.linearGradient.push({
        from: { x: positions[0], y: positions[1] },
        to: { x: positions[2], y: positions[3] },
        stops: rules
      });
    }
  }
  return re;
}

var shadowParamsRegex = new RegExp("(inset )?((?:[\\d.]+px ){4})(#[0-9A-F]{6}|rgba\\([0-9,.]+\\))( none)?");
/**
 * @param {String} style - "box-shadow: ..."
 */
function parseShadow(style) {
  var re = { inner: new Array(), outer: new Array() };
  var s = style.replace(new RegExp("^box-shadow: "), '');
  s = s.replace(new RegExp(";$"), '');
  var ss = s.split(', ');
  var lenRegex = new RegExp("([\\d.]+px)", 'g');
  var parseLens = function(strs){
    var re = {};
    for (var i = 0; i < strs.length; i++) {
      var num = parseFloat(strs[i].replace(new RegExp("px"), ''));
      if (i === 0) {
        re.offsetX = num;
      } else if (i === 1) {
        re.offsetY = num;
      } else if (i === 2) {
        re.blurRadius = num;
      } else if (i === 3) {
        re.spreadRadius = num;
      }
    }
    return re;
  };

  for (var i = 0; i < ss.length; i++) {
    var ms = shadowParamsRegex.exec(ss[i]);
    var params = parseLens(ms[2].match(lenRegex));
    if (ms[3]) {
      params.color = ms[3];
    }
    params.enable = true;
    if (ms[4]) {
      params.enable = false;
    }
    if (ms[1]) {
      re.inner.push(params);
    } else {
      re.outer.push(params);
    }
  }

  return re;
}

function setShadow(layer, style) {
  var inner = style.inner;
  var outer = style.outer;
  var createShadow = function(s){
    var shadow = MSStyleShadow.alloc().init();
    shadow.offsetX = s.offsetX;
    shadow.offsetY = s.offsetY;
    shadow.blurRadius = s.blurRadius;
    shadow.spread = s.spreadRadius;
    if (s.enable) {
      shadow.isEnabled = true;
    } else {
      shadow.isEnabled = false;
    }
    shadow.color = _.stringToColor(s.color);
    return shadow;
  };

  if (inner.length > 0) {
    var shadows = new Array();
    for (var i = 0; i < inner.length; i++) {
      shadows.push(createShadow(inner[i]));
    }
    layer.style().innerShadows = shadows;
  }

  if (outer.length > 0) {
    var shadows = new Array();
    for (var i = 0; i < outer.length; i++) {
      shadows.push(createShadow(outer[i]));
    }
    layer.style().shadows = shadows;
  }
}

module.exports = Importer;
