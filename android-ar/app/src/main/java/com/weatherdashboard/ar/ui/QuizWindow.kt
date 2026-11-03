package com.weatherdashboard.ar.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.weatherdashboard.ar.data.QuizSession
import com.weatherdashboard.ar.data.isRating
import com.weatherdashboard.ar.i18n.Strings

/**
 * หน้าต่างเกมตอบคำถามที่ลอยอยู่เหนือ marker ชนิด quiz
 *
 * ออกแบบให้กดจบได้ด้วยนิ้วเดียวขณะถือมือถือส่องภาพ — หนึ่งจอมีคำถามเดียว
 * สี่ตัวเลือกเรียงลงมา กดแล้วเฉลยทันทีโดยไม่ต้องรอเน็ต แล้วค่อยกดไปข้อถัดไป
 *
 * ปุ่มทั้งหมดเป็น Box ที่ clickable ไม่ได้ใช้ Button ของ Material เพราะพื้นหลังเป็นภาพจริง
 * จึงต้องคุมคอนทราสต์เองให้เหมือนหน้าต่างใบอื่นในแอป
 */
@Composable
fun QuizWindow(
    state: QuizSession.State,
    strings: Strings,
    onStart: () -> Unit,
    onChoose: (Int) -> Unit,
    onNext: () -> Unit,
    onAgain: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ArColors.Surface)
            .border(1.dp, ArColors.SurfaceSoft, RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = strings.quizTitle,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = ArColors.Accent,
            )
            if (state.phase == QuizSession.Phase.PLAYING && state.questions.isNotEmpty()) {
                // ข้อความรู้สึกไม่ใช่ข้อสอบ จึงไม่ขึ้นเป็น "ข้อ 6 จาก 6" ให้สับสน
                val scored = state.questions.count { it.answerIndex >= 0 }
                Text(
                    text = if (state.current?.isRating == true) {
                        strings.quizFinalQuestion
                    } else {
                        strings.quizProgress(state.index + 1, scored)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = ArColors.OnSurfaceMuted,
                )
            }
        }

        when (state.phase) {
            QuizSession.Phase.IDLE -> {
                Text(
                    text = strings.quizIntro,
                    style = MaterialTheme.typography.bodyMedium,
                    color = ArColors.OnSurfaceMuted,
                )
                ActionButton(strings.quizStart, onStart)
            }

            QuizSession.Phase.LOADING -> Busy(strings.quizLoading)

            QuizSession.Phase.PLAYING -> {
                val question = state.current
                if (question == null) {
                    Busy(strings.quizLoading)
                } else {
                    Text(
                        text = question.prompt,
                        style = MaterialTheme.typography.titleSmall,
                        color = ArColors.OnSurface,
                    )

                    val picked = state.answers.getOrNull(state.index) ?: -1

                    if (question.isRating) {
                        RatingRow(
                            choices = question.choices,
                            picked = picked,
                            lowLabel = strings.quizScaleLow,
                            highLabel = strings.quizScaleHigh,
                            onChoose = onChoose,
                        )
                    } else {
                        question.choices.forEachIndexed { index, choice ->
                            ChoiceRow(
                                text = choice,
                                revealed = state.revealed,
                                isAnswer = index == question.answerIndex,
                                isPicked = index == picked,
                                onClick = { onChoose(index) },
                            )
                        }
                    }

                    if (state.revealed) {
                        // ข้อความรู้สึกไม่มีถูกผิด จึงไม่มีอะไรให้เฉลย
                        if (!question.isRating) {
                            val right = picked == question.answerIndex
                            Text(
                                text = if (right) strings.quizCorrect else strings.quizWrong,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                color = if (right) ArColors.Ok else ArColors.Alert,
                            )
                        }
                        ActionButton(
                            // ข้อความรู้สึกเป็นการส่งข้อมูล ไม่ใช่การเปิดดูเฉลย ปุ่มจึงบอกว่า "ส่ง"
                            // คะแนนจะขึ้นหลังเซิร์ฟเวอร์รับและตรวจให้แล้วเท่านั้น
                            text = when {
                                question.isRating -> strings.quizSubmit
                                state.isLast -> strings.quizFinish
                                else -> strings.quizNext
                            },
                            onClick = onNext,
                        )
                    }
                }
            }

            QuizSession.Phase.SUBMITTING -> Busy(strings.quizSending)

            QuizSession.Phase.DONE -> {
                Text(
                    text = strings.quizScore(state.correct, state.total),
                    style = MaterialTheme.typography.titleMedium,
                    color = ArColors.OnSurface,
                )
                if (state.total > 0 && state.correct == state.total) {
                    Text(
                        text = strings.quizPerfect,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = ArColors.Ok,
                    )
                }
                if (state.failedToSend) {
                    Text(
                        text = strings.quizOffline,
                        style = MaterialTheme.typography.bodySmall,
                        color = ArColors.Warn,
                    )
                }
                ActionButton(strings.quizAgain, onAgain)
            }

            QuizSession.Phase.ERROR -> {
                Text(
                    text = strings.quizError,
                    style = MaterialTheme.typography.bodyMedium,
                    color = ArColors.Alert,
                )
                ActionButton(strings.quizStart, onStart)
            }
        }
    }
}

/**
 * แถบให้คะแนน 0–5 ของคำถามปิดท้าย
 *
 * วาดเป็นปุ่มตัวเลขเรียงแนวนอนแทนรายการแนวตั้งด้วยเหตุผลสองข้อ — หกตัวเลือกเรียงลงมา
 * จะทำให้หน้าต่างยาวจนบังภาพจริงที่กำลังส่องอยู่ และรูปทรงที่ต่างจากข้ออื่น
 * ช่วยบอกเองว่าข้อนี้ไม่ใช่ข้อสอบ ไม่มีคำตอบถูก
 */
@Composable
private fun RatingRow(
    choices: List<String>,
    picked: Int,
    lowLabel: String,
    highLabel: String,
    onChoose: (Int) -> Unit,
) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            choices.forEachIndexed { index, label ->
                val active = index == picked
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (active) ArColors.Accent else Color.Transparent)
                        .border(
                            1.dp,
                            if (active) ArColors.Accent else ArColors.SurfaceSoft,
                            RoundedCornerShape(10.dp),
                        )
                        .clickable { onChoose(index) }
                        .padding(vertical = 11.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label,
                        style = MaterialTheme.typography.titleSmall,
                        color = if (active) Color(0xFF04121C) else ArColors.OnSurface,
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 5.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(lowLabel, style = MaterialTheme.typography.bodySmall, color = ArColors.OnSurfaceMuted)
            Text(highLabel, style = MaterialTheme.typography.bodySmall, color = ArColors.OnSurfaceMuted)
        }
    }
}

/**
 * ตัวเลือกหนึ่งข้อ
 *
 * ก่อนตอบทุกตัวหน้าตาเหมือนกันหมด ตอบแล้วถึงย้อมสี — เขียวคือคำตอบที่ถูก
 * แดงเฉพาะตัวที่กดผิด ตัวที่เหลือจางลงเพื่อให้สายตาไปอยู่ที่สองตัวนั้น
 */
@Composable
private fun ChoiceRow(
    text: String,
    revealed: Boolean,
    isAnswer: Boolean,
    isPicked: Boolean,
    onClick: () -> Unit,
) {
    val tone: Color = when {
        !revealed -> ArColors.OnSurface
        isAnswer -> ArColors.Ok
        isPicked -> ArColors.Alert
        else -> ArColors.OnSurfaceMuted
    }
    val edge: Color = when {
        !revealed -> ArColors.SurfaceSoft
        isAnswer -> ArColors.Ok
        isPicked -> ArColors.Alert
        else -> ArColors.SurfaceSoft
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, edge, RoundedCornerShape(10.dp))
            // ตอบไปแล้วกดซ้ำไม่ได้ กัน double tap เปลี่ยนคำตอบหลังเห็นเฉลย
            .then(if (revealed) Modifier else Modifier.clickable(onClick = onClick))
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = tone,
        )
    }
}

/**
 * ใบย่อของ marker เกมตอนที่ยังไม่ได้โฟกัส
 *
 * marker ชนิดอื่นใช้ใบค่าเซนเซอร์เป็นใบย่อ แต่จุดเกมไม่มีค่าให้แสดง
 * ถ้าใช้ใบเดียวกันจะขึ้นว่า "ยังไม่มีข้อมูล" ซึ่งชวนเข้าใจผิดว่าจุดนี้เสีย
 */
@Composable
fun QuizTeaser(strings: Strings, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(ArColors.Surface)
            .border(1.dp, ArColors.SurfaceSoft, RoundedCornerShape(16.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Text(
            text = strings.quizTitle,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = ArColors.Accent,
        )
        Text(
            text = strings.quizStart,
            style = MaterialTheme.typography.bodyMedium,
            color = ArColors.OnSurfaceMuted,
        )
    }
}

@Composable
private fun ActionButton(text: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(ArColors.Accent)
            .clickable(onClick = onClick)
            .padding(vertical = 13.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF04121C),
        )
    }
}

@Composable
private fun Busy(label: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp),
            strokeWidth = 2.5.dp,
            color = ArColors.Accent,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = ArColors.OnSurfaceMuted,
        )
    }
}
