import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './Home.module.scss'
import { useSocket } from '../context/SocketContext'
import ChatMessage from '../components/chat/ChatMessage'
import CommandAutocomplete, { getFilteredCommands } from '../components/chat/CommandAutocomplete'
import Header from '../components/Header'
import Drawer from '../components/Drawer'
import type { ChatMessage as ChatMessageType, CommandInfo, PlayerStatsData, ChannelInfo } from '@shared/types'

function Home() {
  const { socket, sessionInfo, updateProfileImage } = useSocket()
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [commandFilter, setCommandFilter] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [userCount, setUserCount] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [playerStats, setPlayerStats] = useState<PlayerStatsData>({ hp: 100, maxHp: 100, mp: 50, maxMp: 50 })
  const [currentChannel, setCurrentChannel] = useState<string | null>(null)
  const [channelList, setChannelList] = useState<ChannelInfo[]>([])
  const inputRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!socket) return

    const onChatHistory = (history: ChatMessageType[]) => {
      setMessages(history)
    }

    const onChatMessage = (msg: ChatMessageType) => {
      setMessages(prev => [...prev, msg])
    }

    const onCommandList = (list: CommandInfo[]) => {
      setCommands(list)
    }

    const onUserCount = (count: number) => {
      setUserCount(count)
    }

    const onPlayerStats = (data: PlayerStatsData) => {
      setPlayerStats(data)
    }

    const onChannelChanged = (channel: string | null, history: ChatMessageType[]) => {
      setCurrentChannel(channel)
      setMessages(history)
    }

    const onChannelList = (list: Parameters<typeof setChannelList>[0]) => {
      setChannelList(list)
    }

    socket.on('chatHistory', onChatHistory)
    socket.on('chatMessage', onChatMessage)
    socket.on('commandList', onCommandList)
    socket.on('userCount', onUserCount)
    socket.on('playerStats', onPlayerStats)
    socket.on('channelChanged', onChannelChanged)
    socket.on('channelList', onChannelList)
    socket.emit('requestChatHistory')
    socket.emit('requestCommandList')
    socket.emit('requestUserCount')
    socket.emit('requestChannelList')
    return () => {
      socket.off('chatHistory', onChatHistory)
      socket.off('chatMessage', onChatMessage)
      socket.off('commandList', onCommandList)
      socket.off('userCount', onUserCount)
      socket.off('playerStats', onPlayerStats)
      socket.off('channelChanged', onChannelChanged)
      socket.off('channelList', onChannelList)
    }
  }, [socket])

  // 새 메시지가 오면 스크롤 하단으로
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

const sendMessage = useCallback(() => {
    const content = inputRef.current?.textContent?.trim()
    if (!content || !socket) return

    socket.emit('sendMessage', content)
    inputRef.current!.textContent = ''
    inputRef.current!.focus()
    setShowAutocomplete(false)
  }, [socket])

  const selectCommand = useCallback((name: string) => {
    if (!inputRef.current) return
    inputRef.current.textContent = `/${name} `
    // 커서를 끝으로 이동
    const range = document.createRange()
    range.selectNodeContents(inputRef.current)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    inputRef.current.focus()

    const text = inputRef.current?.textContent ?? '';
    setCommandFilter(text);
    setActiveIndex(0);
  }, [])

  const handleInput = useCallback(() => {
    const text = inputRef.current?.textContent ?? ''
    // /로 시작하면 자동완성 표시
    if (text.startsWith('/')) {
      setCommandFilter(text)
      setShowAutocomplete(true)
      setActiveIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }, [])

  // 자동완성에서 필터된 명령어 수 계산 (키보드 네비게이션용)
  const getFilteredCount = useCallback(() => {
    const filtered = getFilteredCommands(commands, commandFilter);
    return filtered.length;
  }, [commandFilter, commands])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete) {
      const count = getFilteredCount()

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(prev => (prev - 1 + count) % count)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(prev => (prev + 1) % count)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const filtered = getFilteredCommands(commands, commandFilter);
        if (filtered[activeIndex]) {
          selectCommand(filtered[activeIndex].name)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowAutocomplete(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [showAutocomplete, getFilteredCount, commandFilter, commands, activeIndex, selectCommand, sendMessage])

  return (
    <div className={styles.homeContainer}>
      <div className={styles.chatArea}>
        <Header
          userCount={userCount}
          onMenuClick={() => setDrawerOpen(true)}
          channelName={
            sessionInfo && currentChannel === `private_${sessionInfo.userId}`
              ? '개인 채널'
              : channelList.find(ch => ch.id === currentChannel)?.name ?? '메인'
          }
        />
        <div className={styles.chatMessages}>
          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              message={msg}
              showHeader={i === 0
                || messages[i - 1].userId !== msg.userId
                || Math.floor(messages[i - 1].timestamp / 60000) !== Math.floor(msg.timestamp / 60000)
              }
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className={styles.statusBars}>
          <div className={styles.hpBar}>
            <div className={styles.hpFill} style={{ width: `${Math.max(0, playerStats.hp / playerStats.maxHp) * 100}%` }} />
          </div>
          <div className={styles.mpBar}>
            <div className={styles.mpFill} style={{ width: `${Math.max(0, playerStats.mp / playerStats.maxMp) * 100}%` }} />
          </div>
        </div>
        <div className={styles.chatInput}>
          {showAutocomplete && (
            <CommandAutocomplete
              commands={commands}
              filter={commandFilter}
              activeIndex={activeIndex}
              onSelect={selectCommand}
            />
          )}
          <div
            ref={inputRef}
            className={styles.chatInputField}
            contentEditable
            role="textbox"
            data-placeholder="메시지를 입력하세요"
            onInput={handleInput}
            onKeyDown={handleKeyDown}
          />
          <button onClick={sendMessage}>전송</button>
        </div>
      </div>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        nickname={sessionInfo?.nickname}
        profileImage={sessionInfo?.profileImage}
        onProfileUpdate={updateProfileImage}
        userId={sessionInfo?.userId}
        currentChannel={currentChannel}
        channelList={channelList}
        onJoinChannel={(channel) => socket?.emit('joinChannel', channel)}
      />
    </div>
  )
}

export default Home
