@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   電腦上的預覽網址： http://localhost:8080/
echo   手機要看（手機和電腦要連同一個 Wi-Fi）：
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo        http://%%a:8080/
echo   第一次執行時，Windows 防火牆會問要不要允許，請按「允許存取」。
echo   關掉這個視窗，預覽就會停止。
echo.
start "" http://localhost:8080/
python dev-server.py 8080 2>nul || py dev-server.py 8080
