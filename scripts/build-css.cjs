#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * A small CSS bundler: merges the modules into one file
 */
function buildCSS() {
  const cssDir = path.join(__dirname, '../src/styles');
  const outputFile = path.join(__dirname, '../styles.css');
  
  console.log('🔨 Building CSS modules...');
  
  // Read the entry CSS file
  const mainCSS = fs.readFileSync(path.join(cssDir, 'main.css'), 'utf8');
  
  // Resolve the @import directives
  const processedCSS = processImports(mainCSS, cssDir);
  
  // Write the result
  fs.writeFileSync(outputFile, processedCSS);
  
  console.log('✅ CSS modules built successfully!');
  console.log(`📁 Output: ${outputFile}`);
  
  // Report the stats
  const lines = processedCSS.split('\n').length;
  console.log(`📊 Total lines: ${lines}`);
}

/**
 * Resolves @import directives by inlining the file contents
 */
function processImports(css, baseDir) {
  return css.replace(/@import\s+['"]([^'"]+)['"];?/g, (match, importPath) => {
    const fullPath = path.resolve(baseDir, importPath);
    
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠️  CSS file not found: ${fullPath}`);
      return match;
    }
    
    const content = fs.readFileSync(fullPath, 'utf8');
    console.log(`📦 Including: ${importPath}`);
    
    // Resolve imports inside the included file recursively
    return processImports(content, path.dirname(fullPath));
  });
}

// Run the build
if (require.main === module) {
  buildCSS();
}

module.exports = { buildCSS };
