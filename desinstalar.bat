@echo off
setlocal
rem CORTEX IA - remove o inicio automatico e os atalhos (os dados em \data continuam na pasta)
title Desinstalando o Cortex IA
cd /d "%~dp0"
echo.
echo  Isto remove o inicio automatico e os atalhos da Area de trabalho.
echo  Os dados (pasta "data") NAO sao apagados.
echo.
choice /c SN /m "  Continuar"
if errorlevel 2 exit /b 0

rem Encerra o Cortex se estiver rodando nesta pasta
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*%~dp0*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>nul

where node >nul 2>nul
if errorlevel 1 (
  del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Cortex IA.vbs" 2>nul
  echo  Node.js nao encontrado: removi so o inicio automatico. Apague os atalhos da Area de trabalho manualmente.
) else (
  call npm run windows:remover --silent
)
echo.
echo  Pronto. Para remover tudo, apague esta pasta depois de fechar esta janela.
echo.
pause
endlocal
