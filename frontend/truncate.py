lines = open('src/app/auth/reset-password/page.tsx', encoding='utf-8').read().split('\n')
open('src/app/auth/reset-password/page.tsx', 'w', encoding='utf-8').write('\n'.join(lines[:234]))
