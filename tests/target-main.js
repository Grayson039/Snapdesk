// Test helper: a frameless window at 0,0 painting f(x,y) per pixel, so screen coordinates equal page coordinates.
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('disable-gpu'); app.commandLine.appendSwitch('force-color-profile', 'srgb');
app.whenReady().then(() => {
  const w = new BrowserWindow({ x: 0, y: 0, width: 1280, height: 800, frame: false, resizable: false, show: true, backgroundColor: '#000', webPreferences: { sandbox: true } });
  w.setBounds({ x: 0, y: 0, width: 1280, height: 800 });
  const html = `<body style="margin:0;overflow:hidden;background:#000"><canvas id=c width=1280 height=800 style="display:block;width:1280px;height:800px"></canvas><script>
  const c=document.getElementById('c'),g=c.getContext('2d'),im=g.createImageData(1280,800);
  for(let y=0;y<800;y++)for(let x=0;x<1280;x++){const i=(y*1280+x)*4;im.data[i]=(x*7)%256;im.data[i+1]=(y*5)%256;im.data[i+2]=((x+y)*3)%256;im.data[i+3]=255}
  g.putImageData(im,0,0);</script></body>`;
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  console.log('TARGET READY');
});
app.on('window-all-closed', () => app.quit());
