import { NextRequest, NextResponse } from 'next/server'

const EXTRACTOR_URL = process.env.EXTRACTOR_URL

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  if (!EXTRACTOR_URL) {
    return NextResponse.json({ error: 'EXTRACTOR_URL not configured' }, { status: 500 })
  }

  const { jobId } = await params

  try {
    const res = await fetch(`${EXTRACTOR_URL}/job-status/${jobId}`, {
      cache: 'no-store',
    })

    if (res.status === 404) {
      return NextResponse.json({ status: 'not_found' }, { status: 404 })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ status: 'unreachable' }, { status: 502 })
  }
}
