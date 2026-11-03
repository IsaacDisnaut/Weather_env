package com.weatherdashboard.ar.ar

import android.opengl.GLES11Ext
import android.opengl.GLES20
import com.google.ar.core.Coordinates2d
import com.google.ar.core.Frame
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * วาดภาพจากกล้องเป็นฉากหลัง
 *
 * ARCore ไม่ได้วาดภาพกล้องให้เอง แต่ส่งมาเป็น texture แบบ OES ที่ต้องวาดเองด้วย OpenGL
 * ที่นี่จึงมีแค่สี่เหลี่ยมเต็มจอหนึ่งชิ้นกับ shader ที่ sample texture นั้น
 * ส่วน popup ทั้งหมดเป็น Compose ที่ลอยทับอยู่ด้านบนอีกที
 */
class BackgroundRenderer {

    var textureId: Int = -1
        private set

    private var program = 0
    private var positionAttrib = 0
    private var texCoordAttrib = 0
    private var textureUniform = 0

    private lateinit var quadCoords: FloatBuffer
    private lateinit var quadTexCoords: FloatBuffer

    /** เฟรมแรกยังไม่เคยคำนวณพิกัด texture จึงต้องบังคับคำนวณหนึ่งครั้ง */
    private var texCoordsDirty = true

    fun createOnGlThread() {
        val textures = IntArray(1)
        GLES20.glGenTextures(1, textures, 0)
        textureId = textures[0]
        GLES20.glBindTexture(TEXTURE_TARGET, textureId)
        GLES20.glTexParameteri(TEXTURE_TARGET, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(TEXTURE_TARGET, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(TEXTURE_TARGET, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(TEXTURE_TARGET, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)

        quadCoords = floatBuffer(QUAD_COORDS)
        quadTexCoords = floatBuffer(FloatArray(QUAD_COORDS.size))

        val vertexShader = compile(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER)
        val fragmentShader = compile(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER)

        program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vertexShader)
        GLES20.glAttachShader(program, fragmentShader)
        GLES20.glLinkProgram(program)
        GLES20.glDeleteShader(vertexShader)
        GLES20.glDeleteShader(fragmentShader)

        val linked = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0)
        check(linked[0] == GLES20.GL_TRUE) {
            "link shader ไม่สำเร็จ: ${GLES20.glGetProgramInfoLog(program)}"
        }

        positionAttrib = GLES20.glGetAttribLocation(program, "a_Position")
        texCoordAttrib = GLES20.glGetAttribLocation(program, "a_TexCoord")
        textureUniform = GLES20.glGetUniformLocation(program, "u_Texture")
        texCoordsDirty = true
    }

    fun draw(frame: Frame) {
        if (textureId == -1) return

        // ตอนหมุนจอหรือเปลี่ยนขนาด viewport ต้องแปลงพิกัด texture ใหม่ ไม่งั้นภาพจะเอียง
        if (frame.hasDisplayGeometryChanged() || texCoordsDirty) {
            frame.transformCoordinates2d(
                Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
                quadCoords,
                Coordinates2d.TEXTURE_NORMALIZED,
                quadTexCoords,
            )
            texCoordsDirty = false
        }

        // timestamp 0 = ยังไม่มีเฟรมจริงจากกล้อง
        if (frame.timestamp == 0L) return

        quadCoords.position(0)
        quadTexCoords.position(0)

        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glDepthMask(false)

        GLES20.glUseProgram(program)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(TEXTURE_TARGET, textureId)
        GLES20.glUniform1i(textureUniform, 0)

        GLES20.glVertexAttribPointer(positionAttrib, 2, GLES20.GL_FLOAT, false, 0, quadCoords)
        GLES20.glVertexAttribPointer(texCoordAttrib, 2, GLES20.GL_FLOAT, false, 0, quadTexCoords)
        GLES20.glEnableVertexAttribArray(positionAttrib)
        GLES20.glEnableVertexAttribArray(texCoordAttrib)

        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

        GLES20.glDisableVertexAttribArray(positionAttrib)
        GLES20.glDisableVertexAttribArray(texCoordAttrib)
        GLES20.glUseProgram(0)
        GLES20.glDepthMask(true)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
    }

    private fun compile(type: Int, source: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, source)
        GLES20.glCompileShader(shader)

        val compiled = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
        if (compiled[0] == GLES20.GL_FALSE) {
            val log = GLES20.glGetShaderInfoLog(shader)
            GLES20.glDeleteShader(shader)
            error("compile shader ไม่สำเร็จ: $log")
        }
        return shader
    }

    private fun floatBuffer(values: FloatArray): FloatBuffer =
        ByteBuffer.allocateDirect(values.size * Float.SIZE_BYTES)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer()
            .apply {
                put(values)
                position(0)
            }

    private companion object {
        const val TEXTURE_TARGET = GLES11Ext.GL_TEXTURE_EXTERNAL_OES

        /** สี่เหลี่ยมเต็มจอในพิกัด NDC วาดแบบ triangle strip */
        val QUAD_COORDS = floatArrayOf(-1f, -1f, +1f, -1f, -1f, +1f, +1f, +1f)

        val VERTEX_SHADER = """
            attribute vec4 a_Position;
            attribute vec2 a_TexCoord;
            varying vec2 v_TexCoord;
            void main() {
                gl_Position = a_Position;
                v_TexCoord = a_TexCoord;
            }
        """.trimIndent()

        val FRAGMENT_SHADER = """
            #extension GL_OES_EGL_image_external : require
            precision mediump float;
            varying vec2 v_TexCoord;
            uniform samplerExternalOES u_Texture;
            void main() {
                gl_FragColor = texture2D(u_Texture, v_TexCoord);
            }
        """.trimIndent()
    }
}
