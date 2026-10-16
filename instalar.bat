@echo off
setlocal
rem ============================================================
rem  CORTEX IA - instalador para Windows (duplo clique)
rem  1. confere o Node.js  2. instala as dependencias
rem  3. prepara a interface  4. inicia com o Windows + atalhos
rem ============================================================
title Instalando o Cortex IA
cd /d "%~dp0"

echo.
echo  ==========================================
echo    CORTEX IA - instalacao
echo  ==========================================
echo.

rem --- Rodando de dentro do ZIP (pasta temporaria)? ---
echo "%~dp0" | find /i "\AppData\Local\Temp\" >nul
if not errorlevel 1 (
  echo  [!] Parece que voce abriu este arquivo de dentro do ZIP.
  echo      Extraia o ZIP primeiro ^(botao direito ^> Extrair tudo^),
  echo      de preferencia numa pasta fixa como C:\Cortex, e rode de novo.
  echo.
  pause
  exit /b 1
)

rem --- Aviso se estiver em Downloads ---
echo "%~dp0" | find /i "\Downloads\" >nul
if not errorlevel 1 (
  echo  [aviso] A pasta esta dentro de Downloads.
  echo          Se ela for apagada ou movida, os atalhos param de funcionar.
  echo          Recomendado: mover para uma pasta fixa, ex.: C:\Cortex
  echo.
  choice /c SN /m "  Continuar mesmo assim"
  if errorlevel 2 exit /b 1
  echo.
)

rem --- Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] O Node.js nao esta instalado neste computador.
  echo      Vou abrir a pagina de download. Instale a versao "LTS"
  echo      ^(e so avancar no instalador^) e depois rode este arquivo de novo.
  echo.
  start "" "https://nodejs.org/pt/download"
  pause
  exit /b 1
)
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)"
if errorlevel 1 (
  for /f "delims=" %%v in ('node -v') do set NODEV=%%v
  echo  [!] O Node.js instalado e antigo. O Cortex precisa da versao 20 ou mais nova.
  echo      Atualize em https://nodejs.org ^(versao LTS^) e rode este arquivo de novo.
  start "" "https://nodejs.org/pt/download"
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  [ok] Node.js %%v encontrado.

rem --- Este PC fica na TV? ---
echo.
choice /c SN /m "  Este computador fica ligado numa TV (abrir o modo TV em tela cheia ao ligar)"
if errorlevel 2 (set TVFLAG=) else (set TVFLAG=--tv)
echo.

rem --- Dependencias ---
echo  [1/3] Instalando dependencias (pode levar alguns minutos)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  [!] Falha ao instalar as dependencias.
  echo      Confira a conexao com a internet ^(ou o proxy/antivirus da empresa^)
  echo      e rode este arquivo de novo. A mensagem de erro esta acima.
  pause
  exit /b 1
)

rem --- Interface ---
echo.
echo  [2/3] Preparando a interface...
call npm run build --silent
if errorlevel 1 (
  echo  [!] Falha ao preparar a interface. A mensagem de erro esta acima.
  pause
  exit /b 1
)

rem --- Inicializacao do Windows + atalhos ---
echo.
echo  [3/3] Configurando o inicio automatico e os atalhos...
if defined TVFLAG (call npm run windows:instalar --silent -- --tv) else (call npm run windows:instalar --silent)
if errorlevel 1 (
  echo  [!] Nao consegui criar o inicio automatico. A mensagem de erro esta acima.
  pause
  exit /b 1
)

rem --- Inicia agora ---
echo.
echo  Iniciando o Cortex...
start "" wscript "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Cortex IA.vbs"
timeout /t 8 /nobreak >nul
if not defined TVFLAG start "" "http://localhost:3210"

echo.
echo  ==========================================
echo    Pronto! O Cortex esta instalado.
echo  ==========================================
echo.
echo   - Abre sozinho quando o Windows liga.
echo   - Atalhos na Area de trabalho: "Cortex IA" e "Cortex IA - Modo TV".
echo   - Primeiro acesso: organizacao grupo-valmar,
echo     marina@grupovalmar.com.br, senha cortex2026 (dados de demonstracao).
echo   - Para desinstalar: desinstalar.bat nesta pasta.
echo.
pause
endlocal
