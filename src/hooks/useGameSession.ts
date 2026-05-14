import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useGameSession(lobbyCode: string, playerId: string | null) {
    const [status, setStatus] = useState('LOBBY')
    const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null)
    const [isConnected, setIsConnected] = useState(false)

    useEffect(() => {
        if (!lobbyCode) return

        const fetchState = async () => {
            const { data } = await supabase.from('lobbies').select('status, buzzed_player_id').eq('code', lobbyCode).single()
            if (data) {
                setStatus(data.status)
                setBuzzedPlayerId(data.buzzed_player_id)
            }
        }

        fetchState()

        const channel = supabase.channel(`game:${lobbyCode}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'lobbies',
                filter: `code=eq.${lobbyCode}`
            }, (payload) => {
                const newData = payload.new
                if (newData.status) setStatus(newData.status)
                if (newData.buzzed_player_id !== undefined) setBuzzedPlayerId(newData.buzzed_player_id)
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setIsConnected(true)
            })

        return () => {
            supabase.removeChannel(channel)
        }
    }, [lobbyCode])

    const buzz = async () => {
        if (status !== 'BUZZING' || !playerId) return false
        const { data, error } = await supabase.rpc('buzz_in', {
            p_lobby_code: lobbyCode,
            p_player_id: playerId
        })
        return data === true
    }

    return { status, buzzedPlayerId, isConnected, buzz }
}
