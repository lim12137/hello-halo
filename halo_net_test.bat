@echo off
setlocal
set "OUT=%USERPROFILE%\Desktop\halo_net_test.txt"

echo Halo network test > "%OUT%"
echo Time: %DATE% %TIME%>> "%OUT%"
echo User: %USERNAME%>> "%OUT%"
echo.>> "%OUT%"

echo === DNS ===>> "%OUT%"
nslookup copilot.tencent.com >> "%OUT%" 2>&1
echo.>> "%OUT%"

echo === HTTPS root ===>> "%OUT%"
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $r=Invoke-WebRequest -Method Head -Uri 'https://copilot.tencent.com/' -TimeoutSec 10; 'Status: '+$r.StatusCode; 'Server: '+$r.Headers['Server']; 'Date: '+$r.Headers['Date'] } catch { $_ | Out-String }" >> "%OUT%" 2>&1
echo.>> "%OUT%"

echo === HTTPS chat completions ===>> "%OUT%"
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { $r=Invoke-WebRequest -Method Head -Uri 'https://copilot.tencent.com/v2/chat/completions' -TimeoutSec 10; 'Status: '+$r.StatusCode; 'Server: '+$r.Headers['Server']; 'Date: '+$r.Headers['Date'] } catch { $_ | Out-String }" >> "%OUT%" 2>&1

echo.>> "%OUT%"
echo Output: "%OUT%"
pause
