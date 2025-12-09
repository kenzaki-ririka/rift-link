const fs = require('fs');
const path = require('path');

const srcDir = process.cwd();
const destDir = path.join(srcDir, 'www');

// 要复制的文件和文件夹
const filesToCopy = [
  'index.html',
  'manifest.json',
  'sw.js',
  'icon-192.svg',
  'css',
  'js',
  'data'
];

// 递归复制目录
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 清空并创建 www 目录
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true });
}
fs.mkdirSync(destDir);

// 复制文件
for (const file of filesToCopy) {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(destDir, file);
  
  if (!fs.existsSync(srcPath)) {
    console.log(`跳过不存在的文件: ${file}`);
    continue;
  }
  
  if (fs.statSync(srcPath).isDirectory()) {
    copyDir(srcPath, destPath);
    console.log(`复制目录: ${file}`);
  } else {
    fs.copyFileSync(srcPath, destPath);
    console.log(`复制文件: ${file}`);
  }
}

console.log('\n✅ 文件已复制到 www 目录');


