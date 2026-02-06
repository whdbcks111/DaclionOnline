import chalk from 'chalk';

// 현재 시간을 포맷팅
const getTimestamp = (): string => {
  const now = new Date();
  return now.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

// 로그 레벨별 색상 및 아이콘
const LOG_STYLES = {
  info: { color: chalk.blue, icon: 'ℹ' },
  success: { color: chalk.green, icon: '✓' },
  warn: { color: chalk.yellow, icon: '⚠' },
  error: { color: chalk.red, icon: '✗' },
  debug: { color: chalk.magenta, icon: '🔍' },
  socket: { color: chalk.cyan, icon: '🔌' },
  http: { color: chalk.green, icon: '🌐' }
};

// 기본 로그 함수
const log = (level: keyof typeof LOG_STYLES, ...args: any[]) => {
  const style = LOG_STYLES[level];
  const timestamp = chalk.gray(`[${getTimestamp()}]`);
  const label = style.color(`[${level.toUpperCase()}]`);
  const icon = style.icon;

  console.log(timestamp, icon, label, ...args);
};

// 커스텀 로거 객체
export const logger = {
  // 일반 정보 로그
  info: (...args: any[]) => log('info', ...args),

  // 성공 로그
  success: (...args: any[]) => log('success', ...args),

  // 경고 로그
  warn: (...args: any[]) => log('warn', ...args),

  // 에러 로그
  error: (...args: any[]) => log('error', ...args),

  // 디버그 로그
  debug: (...args: any[]) => log('debug', ...args),

  // 소켓 관련 로그
  socket: (...args: any[]) => log('socket', ...args),

  // HTTP 요청 로그
  http: (...args: any[]) => log('http', ...args),

  // 커스텀 색상 로그
  custom: (color: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray', ...args: any[]) => {
    const timestamp = chalk.gray(`[${getTimestamp()}]`);
    const colorFunc = chalk[color];
    console.log(timestamp, colorFunc(...args));
  },

  // 구분선 출력
  divider: (char: string = '=', length: number = 50) => {
    console.log(chalk.gray(char.repeat(length)));
  },

  // 박스로 감싸진 메시지
  box: (message: string, color: 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' = 'blue') => {
    const colorFunc = chalk[color];
    const line = '─'.repeat(message.length + 4);
    console.log(colorFunc(`┌${line}┐`));
    console.log(colorFunc(`│  ${message}  │`));
    console.log(colorFunc(`└${line}┘`));
  }
};

// 기본 export
export default logger;
