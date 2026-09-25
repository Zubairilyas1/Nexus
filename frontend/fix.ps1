# 1. Header.tsx fixes
(Get-Content src\components\layout\Header.tsx) -replace 'e: React.KeyboardEvent', 'e: KeyboardEvent' | Set-Content src\components\layout\Header.tsx
# Need to fix the missing )} in Header.tsx manually
